import tracer from "dd-trace";
import {
  aliases,
  assertLoaded,
  ExpressionCondition,
  IdOf,
  Loaded,
  LoadHint,
  tagId,
  tagIds,
  unsafeLoaded,
  withLoaded,
} from "joist-orm";
import { buildQuery } from "joist-orm/knex";
import { Knex } from "knex";
import { Logger } from "pino";
import {
  CheckoutConfig,
  DesignPackageId,
  ItemSlot,
  ItemSlotId,
  Location,
  LocationId,
  MaterialVariant,
  MaterialVariantId,
  ProductOffering,
  ProductOfferingConfig,
  ProjectReadyPlanConfig,
  ReadyPlan,
  ReadyPlanAggregateVersion,
  ReadyPlanOption,
  ReadyPlanOptionGroup,
  ReadyPlanOptionGroupId,
  ReadyPlanOptionGroupVersion,
  ReadyPlanOptionId,
  ReadyPlanOptionVersion,
  Structure,
  TakeoffLineItem,
  TakeoffLineItemVersion,
} from "src/entities";
import { OptionCutoffsMap } from "src/entities/Project.optionCutoffs";
import { formatCentsAsDollars, idsOf, isDefined } from "src/utils";
import { addMargin } from "src/utils/addMargin";
import { DataCache } from "src/utils/dataCache";
import { assertUnsafeLoaded } from "src/utils/entities";
import * as jb from "src/utils/jsonbinding";
import { todayPT } from "src/utils/temporal";
import {
  getPinnedAggregateVersion,
  hasAggregateVersionData,
  maybeGetPinnedAggregateVersion,
} from "src/utils/versioning/aggregateVersionPlugin";
import { rpavAdditionalKey, versionConditions } from "src/utils/versioning/aggregateVersionUtils";

// Use verbose logging
const trace: boolean | ((rpo: Loaded<ReadyPlanOption, "code">) => boolean) = false;
// (rpo) => rpo.code.get.includes("INTSCH002");
// Rounding can be enabled on its own, b/c it can be very unintuitive to see where rounding
// kicks in, but once you know, it can be noisy to see the same rounding logs all the time.
const traceRounding = false;

/** Caches the `options.groupBy(rpog)` for reuse across calculations.  */
const tlivPojo = jb.object({
  id: jb.id(() => TakeoffLineItemVersion),
  identityId: jb.id(() => TakeoffLineItem),
  slotId: jb.id(() => ItemSlot),
  locationId: jb.id(() => Location),
  materialVariant: jb.orUndefined(
    jb.object({
      id: jb.id(() => MaterialVariant),
      preCutoffDesiredMarginInBasisPoints: jb.number(),
      selectionFeeInCents: jb.number(),
    }),
  ),
  quantity: jb.orUndefined(jb.number()),
  leveledUnitCostInCents: jb.orUndefined(jb.number()),
  shouldMultiplySelectionFee: jb.boolean(),
  isPersonalization: jb.boolean(),
  totalCostInCents: jb.number(),
  marginInBasisPoints: jb.number(),
  optionsByGroup: jb.array(
    jb.pair(
      jb.id(() => ReadyPlanOptionGroup),
      jb.set(jb.id(() => ReadyPlanOption)),
    ),
  ),
  optionsSet: jb.set(jb.id(() => ReadyPlanOption)),
  options: jb.array(
    jb.object({ id: jb.id(() => ReadyPlanOption), name: jb.string(), groupId: jb.id(() => ReadyPlanOptionGroup) }),
  ),
  isAddOnV2: jb.boolean(),
  personalizationSlotOrder: jb.orUndefined(jb.number()),
  costCode: jb.string(),
});
type TlivPojo = jb.Infer<typeof tlivPojo>;

const pricingScopeBinding = jb.object({
  baseHouseCost: jb.number(),
  baseHousePrice: jb.number(),
  scopeByLastOptions: jb.map(
    jb.id(() => ReadyPlanOption),
    jb.array(tlivPojo),
  ),
});
type PricingData = jb.Infer<typeof pricingScopeBinding>;

/** Local context for this common set of args. */
export type PricingScope = PricingData & {
  optionCutoffs: OptionCutoffsMap;
  logger: Logger;
  /** When evaluating stacked options like `AddADUFrenchDoor`, if we should turn on their prereqs; only used for cost reporting. */
  includePrereqOptions: boolean;
  /** Whether we should price unselected options; yes for checkout, no for the tracer. */
  includeOtherOptions: boolean;
  /** Whether we should include per-groupsToPrice changed/debugging info; only used for the tracer & cost report. */
  includeChanged: boolean;
  leveledOptionGroups: Set<ReadyPlanOptionGroup>;
  storedPricesByOptionId: Map<ReadyPlanOptionId, number>;
  optionToMaterialSelectionFee: OptionSelectionFeeData;
};

/** The return value of CheckoutConfig.optionPricing. */
export type CheckoutPricing = {
  baseCostInCents: number;
  basePriceInCents: number;
  totalCostInCents: number;
  /** totalPriceInCents is the sum of baseHouse price + selectedOption prices. */
  totalPriceInCents: number;
  /** The initial includedSalesPriceInCents that all prices are deltas from. */
  salesPriceInCents: number;
  optionDetails: Map<ReadyPlanOption, PriceIncrease>;
  /** The cutoff dates for each options, which is used to calculate the price. */
  optionCutoffs: OptionCutoffsMap;
  /** Personalization option groups that have slots that are not backed out */
  rpogsWithSlots: Set<ReadyPlanOptionGroupId>;
};

/** Extended pricing that includes MH/ADU breakdowns */
export type CheckoutPofPricing = CheckoutPricing & {
  mhTotalPriceInCents: number;
  aduTotalPriceInCents: number;
  mhSalesPriceInCents: number;
  aduSalesPriceInCents: number;
};

export const rpoHint = {
  code: {},
  // Margin stuff
  preCutoffDesiredMarginInBasisPoints: {},
  postCutoffDesiredMarginInBasisPoints: {},
  selectionFeeInCents: {},
  minimumPriceInCents: {},
  // Dependency stuff
  optionGroup: { group: "type" },
  optionConflicts: {},
  optionConflictChildren: {},
  optionPrerequisites: { optionGroup: {} },
  optionPrereqChildren: { optionGroup: {} },
  optionDefaultsIf: {},
  optionRequiredIf: {},
  name: {},
} satisfies LoadHint<ReadyPlanOption>;

export const rpogHint = {
  group: "type",
  groupPrerequisites: {},
  groupPrereqChildren: {},
  options: rpoHint,
  optionLevels: {}, // To determine is the RPOG should incorporate material selection fees
  readyPlan: {},
} satisfies LoadHint<ReadyPlanOptionGroup>;

export type LoadedOption = Loaded<ReadyPlanOption, typeof rpoHint>;
type LoadedGroup = Loaded<ReadyPlanOptionGroup, typeof rpogHint>;

// Lighter hints for fixStaleConfig that drops pricing-only fields (margins, name, optionLevels)
// that are never accessed during stale config processing
const fixStaleRpoHint = {
  code: {},
  optionGroup: { group: "type" },
  optionConflicts: {},
  optionConflictChildren: {},
  optionPrerequisites: { optionGroup: {} },
  optionPrereqChildren: { optionGroup: {} },
  optionDefaultsIf: {},
  optionRequiredIf: {},
} satisfies LoadHint<ReadyPlanOption>;

const fixStaleRpogHint = {
  group: "type",
  groupPrerequisites: {},
  options: fixStaleRpoHint,
  readyPlan: {},
} satisfies LoadHint<ReadyPlanOptionGroup>;

// Lighter types for fixStaleConfig/fillInDefaults
// only the fields needed for stale config processing for perf boost
type LightOption = Loaded<ReadyPlanOption, typeof fixStaleRpoHint>;
type LightGroup = Loaded<ReadyPlanOptionGroup, typeof fixStaleRpogHint>;

export type LightOptionMap = Map<ReadyPlanOptionId, LightOption>;

type OptionWithIncludedBy = { rpo: LightOption; includedBy: LightOption[] };

/** Given a set of `maybe*` results, find which one produced `rpo` and return its direct enabler. */
function findDirectEnabler(
  rpo: LightOption,
  ...candidates: (OptionWithIncludedBy | undefined)[]
): LightOption | undefined {
  return candidates.find((c) => c?.rpo === rpo)?.includedBy.last;
}

type CalcOpts = {
  selectedOptions?: ReadyPlanOption[];
  /** Whether to price out non-included/non-selected options; defaults to true since checkout wants those. */
  includeOtherOptions?: boolean;
  includeChanged?: boolean;
  includedOptions?: LoadedOption[];
  includePrereqOptions?: boolean;
};

type CostAndPrice = { costInCents: number; priceInCents: number };

type OptionCostAndPriceAndSelectionFee = {
  costInCents: number;
  priceInCents: number;
  preCutoffPriceInCents: number;
  postCutoffPriceInCents: number;
  selectionFeeInCents: number;
  minimumPriceInCents: number | undefined;
  tlivs: TlivPojo[];
};

type RpogBaselineEntry = OptionCostAndPriceAndSelectionFee & { rpo: LoadedOption };

/**
 * Computes Homeowner-facing option pricing for Checkout.
 *
 * We use both material-catalog & option-catalog pricing data to determine the margin of each
 * line of scope, which requires attributing each line of scope (even stacked lines) to a
 * specific / "owning" option.
 *
 * However, we otherwise do not really care what "portion of the total price" a given option
 * contributes, instead we only care about "how much drift" from the base/included config
 * did this option cause?
 *
 * I.e. if the base price was $800k with SpecLevel:Essential, we want Essential to show
 * as "essentially free" (Included), and the "price" of SpecLevel:Premium has nothing to
 * do with "it's scope" but only "how much drift do I cause from the base SL:Essential"?
 *
 * See the "Correct Mental Model" section of [Checkout Pricing Notes](https://homebound.atlassian.net/wiki/spaces/ENG/pages/3750887429/Checkout+Pricing+Notes)
 * for more information.
 */
export async function getCheckoutPricing(ccfg: CheckoutConfig, opts?: CalcOpts): Promise<CheckoutPofPricing> {
  if (!ccfg.productOffering.isSet && !ccfg.aduProductOffering.isSet) {
    return emptyPricing();
  } else if (ccfg.isReserved || ccfg.isExpired) {
    return getReservedOptionPricing(ccfg);
  } else {
    return tracer.trace("checkout.pricing", { resource: "checkout.pricing" }, async () => {
      return calcCheckoutCostAndPrice(ccfg, opts);
    });
  }
}

/** Given an adhoc `selectedOptions` config, returns the checkout pricing for it. */
export async function calcPofCostAndPrice(
  pof: ProductOffering,
  selectedOptions: ReadyPlanOption[],
  opts?: CalcOpts,
): Promise<CheckoutPricing> {
  return calcPofOptionsCostAndPrice(pof, selectedOptions, undefined, undefined, opts);
}

/** Given a `CheckoutConfig`, calcs its current/live cost/price (i.e. not reserved). */
async function calcCheckoutCostAndPrice(ccfg: CheckoutConfig, opts?: CalcOpts): Promise<CheckoutPofPricing> {
  const { productOffering, aduProductOffering, structure, readyPlanOptions } = await withLoaded(
    ccfg.populate({
      productOffering: {},
      aduProductOffering: {},
      structure: "aduStructure",
      readyPlanOptions: "readyPlan",
    }),
  );
  const aduStructure = structure.aduStructure.get;
  if (!productOffering && !aduProductOffering) return emptyPricing();
  // Partition options by POF and price each in parallel
  const [mhOptions, aduOptions] = readyPlanOptions.partition((rpo) => rpo.readyPlan.get === productOffering);
  const [mhPricing, aduPricing] = await [
    { pof: productOffering, options: mhOptions, structure },
    { pof: aduProductOffering, options: aduOptions, structure: aduStructure },
  ].asyncMap(async ({ pof, options, structure }) =>
    pof ? calcPofOptionsCostAndPrice(pof, options, structure, ccfg, opts) : emptyPricing(),
  );
  return mergeCheckoutPricing(mhPricing, aduPricing);
}

/**
 * The main/internal "incremental/drift-based" pricing implementation.
 *
 * We always need a plan/pof, but otherwise can price out both adhoc `selectedOptions`
 * and ccfg-/structure-informed pricing, i.e. accounting for Structure-level UW pricing
 * and Schedule-driven cutoff dates.
 */
async function calcPofOptionsCostAndPrice(
  pof: ProductOffering,
  selectedOptions: ReadyPlanOption[],
  structure: Structure | undefined,
  ccfg: CheckoutConfig | undefined,
  opts: CalcOpts = {},
): Promise<CheckoutPricing> {
  // Temp increase to prevent sporadic errors when viewing checkout
  pof.em.entityLimit = 100_000;

  const { ctx } = pof.em;
  const { logger } = ctx;
  let { includeOtherOptions = true, includedOptions, includeChanged = false, includePrereqOptions = false } = opts;

  const [loadedPof, prpc] = await Promise.all([
    pof.populate({ aggregateActive: {}, aggregateDraft: {}, optionGroups: rpogHint, baseConfig: "readyPlanOptions" }),
    structure?.projectReadyPlanConfig.load().then(async (prpc) => prpc?.populate(prpcHint)),
  ]);
  const { aggregateActive, aggregateDraft, optionGroups, baseConfig } = withLoaded(loadedPof);

  // If we have no config to work off, then we can't setup our includedOptions. So just return placeholder pricing.
  if (!prpc && !baseConfig) return emptyPricing();

  const rpogs: LoadedGroup[] = optionGroups.filter((rpog) => rpog.active);

  // Get the included/UW config, which will initially be the POF base house
  includedOptions ??= getStructureOrBaseConfigOptions(prpc, baseConfig, rpogs);

  // Create a map of stored prices from PRPC options to preserve historical pricing
  const storedPricesByOptionId = new Map<ReadyPlanOptionId, number>();

  prpc?.options.get.forEach((prpco) => storedPricesByOptionId.set(prpco.readyPlanOption.id, prpco.priceInCents));

  // If the AVP has been installed, then pull our rpav from that.  If we're in checkout, then there must be a published
  // rpav. If we're coming from elsewhere, then there must be at least a draft
  const rpav = (await maybeGetPinnedAggregateVersion(pof)) ?? aggregateActive ?? aggregateDraft!;

  // Track cache operation timing with a child span for APM visualization
  function cacheTrace<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const resource = `checkout.pricing.cache_ops.${name}`;
    return tracer.trace(resource, { resource }, fn);
  }
  const [optionCutoffs, priceData, activeScope, optionToMaterialSelectionFee] = await Promise.all([
    // Load TlivScope & optionCutoffs to calculate the matching scope & margins per config
    cacheTrace("load_option_cutoffs", async () => ccfg?.optionCutoffs.load() ?? new Map()),
    cacheTrace("get_pricing_scope", () => pricingScopeCache.get(ctx, pof, rpav)),
    cacheTrace("compute_active_scope", () => computeActiveScope(pof, rpav, selectedOptions)),
    cacheTrace("compute_option_selection_fees", () =>
      computeOptionSelectionFees(loadedPof, rpav, selectedOptions, includedOptions),
    ),
  ]);

  const scope: PricingScope = {
    logger,
    optionCutoffs,
    ...priceData,
    optionToMaterialSelectionFee,
    includePrereqOptions,
    includeOtherOptions,
    includeChanged,
    leveledOptionGroups: new Set(rpogs.filter((rpog) => rpog.optionLevels.get.nonEmpty)),
    storedPricesByOptionId,
  };

  // Check ProjectReadyPlanConfig for Lot/Structure-specific salesPriceInCents first, then fall back to base config
  const salesPriceInCents =
    // If the user is swapping plans, prefer the higher of the two prices
    prpc?.readyPlan.idMaybe !== pof.id
      ? Math.max(prpc?.includedPriceInCents ?? 0, baseConfig?.salesPriceInCents ?? 0)
      : // Otherwise if they're the same plan, prefer the Structure price when/if set
        (prpc?.includedPriceInCents ?? baseConfig?.salesPriceInCents);
  // Establish the starting "includedPrice", which is what our incremental option changes will "drift" from, i.e.
  // - The included config was $1.5m
  // - If you swap to premium, that's a $200k drift (& premium defaults establish "a new baseline" / "new included")
  // - If you swap to add bedroom, that's another $100k drift
  // - If you swap from premium Kitchen Sink SKU1 to Sink SKU2, that's another $100 drift
  // - Resulting is a totalPriceInCents=$1,800,100
  const {
    baseHousePrice,
    baseHouseCost,
    // If salesPriceInCents is already set, this will be the same value echoed back
    salesPriceInCents: includedPrice,
  } = calcStartingCostsAndPrices(scope, includedOptions, salesPriceInCents);

  const baseHouse = costAndPrice(baseHouseCost, baseHousePrice);

  // We always price out the selected options, but only calc "all the other options" for
  // checkout (which is our primary client, but the tracer doesn't need these)
  const optionsToPrice = new Set([
    ...selectedOptions,
    ...(scope.includeOtherOptions ? rpogs.flatMap((rpog) => rpog.options.get).filter((rpo) => rpo.active) : []),
  ]);

  // We need to floor every option group to "whatever the UW config had", to avoid "showing negatives"
  // and not sell a house for less than the propco wants.
  //
  // So first establish our "UW floor" based on the included config
  trace && logger.debug("includedOptions=%s", includedOptions.map(formatRpo));
  const included = calcConfigFullPrice(
    scope,
    baseHouse,
    rpogs,
    includedOptions,
    // Since we're just calcing the included baseline, we don't need any additional options
    new Set(includedOptions),
  );
  // Then calc the selected config full price, i.e. SpecLevel:Premium will be $1.4mm and not "+$200k"
  trace && logger.debug("selectedOptions=%s", selectedOptions.map(formatRpo));
  const selected = calcConfigFullPrice(scope, baseHouse, rpogs, selectedOptions, optionsToPrice);

  // Now calc the "price increments" by gluing the two together
  const optionDetails = calcPriceIncreases(
    scope,
    baseHouse,
    rpogs,
    optionsToPrice,
    included,
    selected,
    selectedOptions as LoadedOption[],
    includedOptions as LoadedOption[],
  );

  const totalCostInCents =
    baseHouse.costInCents + selectedOptions.sum((rpo) => optionDetails.get(rpo as LoadedOption)?.costInCents ?? 0);
  const totalPriceInCents =
    includedPrice + selectedOptions.sum((rpo) => optionDetails.get(rpo as LoadedOption)?.priceInCents ?? 0);

  trace && logger.debug("totalCostInCents=%s", totalCostInCents);
  trace && logger.debug("totalPriceInCents=%s", totalPriceInCents);

  return {
    baseCostInCents: baseHouse.costInCents,
    basePriceInCents: baseHouse.priceInCents,
    totalCostInCents,
    totalPriceInCents,
    salesPriceInCents: includedPrice,
    optionDetails,
    optionCutoffs: scope.optionCutoffs,
    rpogsWithSlots: activeScope.activePersonalizationOptionGroupIds,
  };
}

/** The delta/drift price of each option, which is what we show to the buyer in checkotu. */
type PriceIncrease = {
  // We use separate boolean flags b/c an option can be both included & selected
  isIncluded: boolean;
  isSelected: boolean;
  /** This is actually the total/direct cost, kept largely/only? for historical tests. */
  costInCents: number; // total
  /** The price delta (for $0 if included) of selecting this option. */
  priceInCents: number;
  preCutoffPriceInCents: number;
  postCutoffPriceInCents: number;
  fullPrice: FullPriceOptionDetails;
  /** Any credits they had towards this option, which reduces the price but is not shown directly to the buyer. */
  availableCreditInCents: number;
};

/**
 * Takes the "full home" prices of the UW config (i.e. ElevationA is $1.4mm), and the selected (i.e. ElevationB
 * is $1.5mm), and decides the "$100k increase" (or "Included", etc.) user-facing price of each RPO.
 */
function calcPriceIncreases(
  scope: PricingScope,
  baseHouse: CostAndPrice,
  rpogs: LoadedGroup[],
  optionsToPrice: Set<ReadyPlanOption>,
  included: Map<LoadedOption, FullPriceOptionDetails>,
  priced: Map<LoadedOption, FullPriceOptionDetails>,
  selectedOptions: LoadedOption[],
  includedOptions: LoadedOption[],
): Map<LoadedOption, PriceIncrease> {
  const { logger } = scope;

  const optionDetails = new Map<LoadedOption, PriceIncrease>();
  const selectedSet = new Set(selectedOptions);
  const includedByRpog = includedOptions.keyByObject((rpo) => rpo.optionGroup.get);

  // We seed the `last...FullPrice` with the baseHouse price, so the right away the 1st rpog (i.e. Elevation)
  // can see "the included ElevationA+defaults is $1.4mm over the baseHouse $400k, so the buyer's selected
  // ElevationB+defaults gets $1m of credit".
  let lastIncludedFullPrice = baseHouse.priceInCents;
  let lastSelectedFullPrice = baseHouse.priceInCents;

  // Non-personalization RPOGs use a simpler algorithm of:
  // - In the UW config, this RPOG increased price (vs. previous full-home price) by $200k
  // - So the buyers gets $200k of available credit for their selections
  // - We don't show them "the $200k", we just show them "the delta above (the hidden $200k credit)"
  for (const rpog of rpogs) {
    trace && logger.debug(`Calcing diff for ${rpog.id} ${rpog.name}`);
    // Figure out how much "increase from the last RPOG" the included config had,
    // i.e. UWs config spent $100k to go from ElevationA+defaults to ElevationA+SchemeB,
    // so the buyer gets $100k of "credit" to spend on this RPOG.
    const includedRpo = includedByRpog.get(rpog);
    const includedStats = includedRpo ? included.get(includedRpo)! : undefined;
    const includedFullPrice = includedStats?.priceInCents ?? lastIncludedFullPrice;
    // This becomes a "use it or lose it" amount
    const creditAvailable = includedFullPrice - lastIncludedFullPrice;

    trace &&
      logger.debug(
        `   includedRpo=%s includedFullPrice=%s - lastIncludedFullPrice=%s = creditAvailable=%s`,
        formatRpo(includedRpo),
        formatCentsAsDollars(includedFullPrice),
        formatCentsAsDollars(lastIncludedFullPrice!),
        formatCentsAsDollars(creditAvailable),
      );

    // Each RPOG has to increase by at least the creditAvailable/UW amount (even if we have no
    // selection, i.e. the UW config had an AddBedroom and the selected config does not, they
    // still pay for the AddBedroom).
    let selectedStats: FullPriceOptionDetails | undefined = undefined;

    // For all rpos (included & selected & alternatives) price the "increase from last selected"
    for (const rpo of rpog.options.get.filter((rpo) => optionsToPrice.has(rpo))) {
      // When we're doing the price of AddADUFrenchDoor, the `lastSelectedFullPrice` has neither
      // AddADUFrenchDoor (fine) _nor_ AddADU (not fine) so then our delta of AddADUFrenchDoor ends
      // up pricing in the increment of both...
      //
      // Options of where to fix this:
      // - 1. In createAltConfig, realize we need AddADU
      //     -- tried that, worked for cost, not price
      // - 2. Somewhere in here, realize `lastSelectedFullPrice` needs adjusted
      // - 3. Have cost report be smarter about prereqs and make multiple `calcPofPrice` calls
      //     -- how many is multiple? one per rpog, one per rpo, one for unique set of prereqs?
      const rawPrice = priced.get(rpo)!;
      const rawIncrease = rawPrice.priceInCents - lastSelectedFullPrice;
      const storedPrice = scope.storedPricesByOptionId.get(rpo.id);
      const isIncludedOption = rpo === includedRpo;

      let priceInCents: number;
      let preCutoffPriceInCents: number;
      let postCutoffPriceInCents: number;
      if (storedPrice !== undefined) {
        // If we have a stored "what they paid from an off-system/napkin-math contract" price, always use that.
        priceInCents = storedPrice;
        preCutoffPriceInCents = storedPrice;
        postCutoffPriceInCents = storedPrice;
      } else if (isIncludedOption) {
        // If the option is included, it defacto is $0; we do this b/c in certain "negative credit" scenarios, i.e.
        // where the included option is actually cheaper than the defaulted option, the regular math doesn't work out
        priceInCents = 0;
        preCutoffPriceInCents = 0;
        postCutoffPriceInCents = 0;
      } else {
        // The `creditAvailable` is already baked into the price (i.e. the starting price of $1.4mm includes
        // Deluxe, so we only show price increases that go above the credit).
        // Anything "at or below the credit" will be shown as "Included".
        const diffFromCredit = (newFullPrice: number): number =>
          Math.max(0, newFullPrice - lastSelectedFullPrice - creditAvailable);
        priceInCents = diffFromCredit(rawPrice.priceInCents);
        preCutoffPriceInCents = diffFromCredit(rawPrice.preCutoffPriceInCents);
        postCutoffPriceInCents = diffFromCredit(rawPrice.postCutoffPriceInCents);
      }

      trace &&
        (trace === true || trace(rpo)) &&
        logger.debug(
          `   rpo=%s rawPrice=%s - lastSelectedFullPrice=%s = rawIncrease=%s priceInCents=%s`,
          formatRpo(rpo),
          formatCentsAsDollars(rawPrice.priceInCents),
          formatCentsAsDollars(lastSelectedFullPrice),
          formatCentsAsDollars(rawIncrease),
          formatCentsAsDollars(priceInCents),
        );

      optionDetails.set(rpo, {
        isIncluded: isIncludedOption,
        isSelected: selectedSet.has(rpo),
        costInCents: rawPrice.costInCents,
        priceInCents,
        preCutoffPriceInCents,
        postCutoffPriceInCents,
        fullPrice: rawPrice,
        availableCreditInCents: creditAvailable,
      });
      if (selectedSet.has(rpo)) {
        selectedStats = rawPrice;
      }
    }

    lastIncludedFullPrice = includedFullPrice;
    // If this rpog did have a selection, update `selectedSoFar` for the next "diff above selected"
    if (selectedStats) {
      trace &&
        logger.debug(
          `   updating lastSelectedFullPrice=%s => %s`,
          formatCentsAsDollars(lastSelectedFullPrice),
          formatCentsAsDollars(selectedStats.priceInCents),
        );
      lastSelectedFullPrice = selectedStats.priceInCents;
    }
  }

  return optionDetails;
}

/**
 * The numbers returned by `calcConfigFullPrice` that feed into `calcPriceIncreases`.
 *
 * The top-level fields are all totals, not diffs/deltas from previous selections.
 */
export type FullPriceOptionDetails = {
  /** The new total/full-config cost with this option selected. */
  costInCents: number;
  /** The new total/full-config price with this option selected. */
  priceInCents: number;
  preCutoffPriceInCents: number;
  postCutoffPriceInCents: number;
  /** When this option turned on, both it & all downstream option changes. */
  changed: FullPriceOptionChange[];
};

/** For this `group`, what the previous cost/price & new cost/price are, plus the deltas. */
type FullPriceOptionChange = {
  group: LoadedGroup;
  /** The newly selected option, or unset if it was removed. */
  option: LoadedOption | undefined;
  /** The previously selected option, or unset if one was not selected. */
  previousOption: LoadedOption | undefined;
  prev: OptionCostAndPriceAndSelectionFee | undefined;
  curr: OptionCostAndPriceAndSelectionFee | undefined;
  /** Delta fields: curr - prev (or just curr if no prev, or negated prev if no curr). */
  costChangeInCents: number;
  priceChangeInCents: number;
  selectionFeeChangeInCents: number;
  minimumPriceChangeInCents: number;
};

/**
 * Calculates the non-delta-based price of a full config `selectedOptions`.
 *
 * I.e. `ElevationA + defaults` is $1.4m, `ElevationA + SchemeRed + defaults` is $1.5m.
 *
 * We don't do personalization RPOGs here, b/c they have more nuanced "either UW or selected
 * package credits" pricing, handled in `calcPriceIncreases`.
 */
export function calcConfigFullPrice(
  scope: PricingScope,
  baseHouse: CostAndPrice,
  rpogs: LoadedGroup[],
  selectedOptions: ReadyPlanOption[],
  optionsToPrice: Set<ReadyPlanOption>,
): Map<LoadedOption, FullPriceOptionDetails> {
  const { logger } = scope;
  const optionDetails = new Map<LoadedOption, FullPriceOptionDetails>();
  const selectedByGroup = selectedOptions.keyByObject((rpo) => rpo.optionGroup.id);

  // Build the group-dirties index once: "if group A changes, groups B/C need re-pricing"
  const groupDirties = buildGroupDirtiesIndex(scope);

  // Build index of RPO IDs that influence downstream defaults (for fast-path eligibility)
  const hros = rpogs.nonEmpty ? getHardcodedRequiredOptions(withLoaded(rpogs[0]).readyPlan) : [];
  const downstreamInfluencedIds = buildDownstreamInfluenceIndex(rpogs, hros);

  // Build index of RPOGs that enable downstream groups via groupPrerequisites.
  // I.e. if sinkGroup.groupPrerequisites includes addonGroup, addonGroup can't use the fast path
  // because selecting/deselecting the addon changes whether sink defaults are filled in.
  const groupsWithDownstreamPrereqs = new Set<ReadyPlanOptionGroupId>();
  for (const rpog of rpogs) {
    for (const prereq of rpog.groupPrerequisites.get) {
      groupsWithDownstreamPrereqs.add(prereq.id);
    }
  }

  // As we incrementally walk RPOGs in order, keep track of the partial config (configSoFarSet) that
  // we've seen/is locked in from `selectedOptions`, vs. the remainingGroups that we haven't
  // processed yet, and so can form "what would be the defaults for the current step?".
  const configSoFarSet = new Set<LoadedOption>();
  const groupIdsSoFar: Set<ReadyPlanOptionGroupId> = new Set();
  const remainingGroups = new Set([...rpogs]);
  const rpogsById = rpogs.keyBy((rpog) => rpog.id);

  // Baseline: per-RPOG pricing for all groups (locked-in + downstream). The sum of all entries
  // plus baseHouse gives the full-home total. When a group is locked in, its entry stays in the
  // map — locked-in groups are excluded from groupsToPrice, so they're never re-priced.
  const baselinePricing = new Map<ReadyPlanOptionGroupId, RpogBaselineEntry>();
  let baselineTotal = { ...baseHouse };

  // Mutable set of RPO IDs in the current baseline config, for efficient TLIV matching on the fast path.
  // I.e. rather than building `new Set(idsOf(altConfig))` per-RPO, we maintain one set and swap IDs.
  const baselineRpoIds = new Set<ReadyPlanOptionId>();

  // Go through each RPOG in order, i.e. starting with Elevation, Exterior Scheme, etc.
  for (const rpog of rpogs) {
    trace && logger.debug(`Pricing out full price of ${rpog.id} ${rpog.name}`);
    remainingGroups.delete(rpog);
    const selectedRpo = selectedByGroup.get(rpog.id);
    let selectedChange: ReturnType<typeof calcOptionsCostAndPrice> | undefined;
    let selectedGroupsToPrice: Set<ReadyPlanOptionGroupId> | undefined;

    const activeRpos = rpog.options.get.filter((rpo) => optionsToPrice.has(rpo));

    // Fast-path eligibility: the baseline must exist (first RPOG always uses slow path), and no RPO
    // in this group can influence downstream defaults via optionDefaultsIf, personalizationTargetCombinations,
    // optionRequiredIf, HROs, conflicts with configSoFar, or stacked TLIVs that dirty downstream groups.
    // When eligible, we skip fillInDefaults entirely and just re-price this group's own scope against
    // the stable baseline.
    const canUseFastPath =
      baselinePricing.size > 0 &&
      !scope.includePrereqOptions &&
      // If this group has stacked TLIVs that affect downstream groups, swapping RPOs here
      // changes which downstream TLIVs match (i.e. addon on/off changes personalization scope)
      !groupDirties.has(rpog.id) &&
      // If a downstream group's groupPrerequisites references this group, enabling/disabling
      // this group changes whether downstream groups get their defaults filled in
      !groupsWithDownstreamPrereqs.has(rpog.id) &&
      activeRpos.every(
        (rpo) =>
          !downstreamInfluencedIds.has(rpo.id) &&
          !rpo.optionConflicts.get.some((c) => configSoFarSet.has(c as LoadedOption)) &&
          !rpo.optionConflictChildren.get.some((c) => configSoFarSet.has(c as LoadedOption)),
      );

    if (canUseFastPath) {
      const result = priceRpogFastPath(
        scope,
        rpog,
        activeRpos,
        selectedRpo,
        baselinePricing,
        baselineTotal,
        baselineRpoIds,
        optionDetails,
      );
      if (result) {
        selectedChange = result.selectedChange;
        selectedGroupsToPrice = result.selectedGroupsToPrice;
      }
    } else {
      // --- SLOW PATH: full altConfig computation (existing behavior) ---
      for (const rpo of activeRpos) {
        // Find the new full-price of this RPO + the rest defaults
        const altConfig = createValidAltConfig(remainingGroups, configSoFarSet, rpo, scope);

        // Diff this altConfig vs. the baselinePricing to find which RPOGs changed their selection
        const directlyChanged = new Set<ReadyPlanOptionGroupId>([rpog.id]);
        const altGroupIds = new Set<ReadyPlanOptionGroupId>();
        // Check which downstream groups have a different RPO than the baseline
        for (const altRpo of altConfig) {
          const gid = altRpo.optionGroup.id;
          altGroupIds.add(gid);
          if (configSoFarSet.has(altRpo)) continue; // skip locked-in groups
          const baselineEntry = baselinePricing.get(gid);
          if (!baselineEntry || baselineEntry.rpo !== altRpo) directlyChanged.add(gid);
        }
        // Also check for groups that were in the baseline but are no longer in the altConfig
        for (const gid of baselinePricing.keys()) {
          if (!altGroupIds.has(gid)) directlyChanged.add(gid);
        }

        // Expand to transitively-dirtied downstream groups, excluding locked-in groups
        const groupsToPrice = expandDirtiedGroups(groupDirties, directlyChanged);
        for (const gid of groupIdsSoFar) groupsToPrice.delete(gid);

        // Filter the altConfig to only the RPOs in groups we need to re-price
        const rposToPrice = altConfig.filter((r) => !configSoFarSet.has(r) && groupsToPrice.has(r.optionGroup.id));
        // Price only the changed groups (still using the full altConfig for TLIV matching)
        const change = calcOptionsCostAndPrice(scope, altConfig, rposToPrice);

        // Start from the full baseline total, swap out old prices of changed groups for new ones
        let alt = baselineTotal;
        const changed: FullPriceOptionChange[] = [];
        for (const groupId of groupsToPrice) {
          const prev = baselinePricing.get(groupId);
          const curr = change.rpogCostAndPrice[groupId];
          alt = subCostAndPrice(alt, prev);
          alt = addCostAndPrice(alt, curr);
          // The tracer (and report UIs) wants more detailed information to populate the UI
          if (scope.includeChanged) {
            // Even if there is no change, always push changes for groupsToReprice so the cost report
            // can see the curr.tlivs to calc cost for unchanged/defaulted personalization options.
            changed.push({
              group: rpogsById[groupId],
              option: curr?.rpo,
              previousOption: prev?.rpo,
              prev,
              curr,
              costChangeInCents: (curr?.costInCents ?? 0) - (prev?.costInCents ?? 0),
              priceChangeInCents: (curr?.priceInCents ?? 0) - (prev?.priceInCents ?? 0),
              selectionFeeChangeInCents: (curr?.selectionFeeInCents ?? 0) - (prev?.selectionFeeInCents ?? 0),
              minimumPriceChangeInCents: (curr?.minimumPriceInCents ?? 0) - (prev?.minimumPriceInCents ?? 0),
            });
          }
        }

        trace &&
          (trace === true || trace(rpo)) &&
          logger.debug(
            `   rpo=%s costInCents=%s priceInCents=%s altConfig=%s`,
            formatRpo(rpo),
            formatCentsAsDollars(alt.costInCents),
            formatCentsAsDollars(alt.priceInCents),
            altConfig.map(formatRpo),
          );

        // Useful for debugging specific RPOs, and what costs/prices they're claiming in the `remainingGroups`
        // if (trace && rpog.id === "rpog:34644") {
        //   for (const [rpogId, detail] of Object.entries(change.rpogCostAndPrice)) {
        //     logger.debug(
        //       `   - rpog=%s costInCents=%s selectionFeeInCents=%s minimumPriceInCents=%s priceInCents=%s`,
        //       rpogId,
        //       formatCentsAsDollars(detail.costInCents),
        //       formatCentsAsDollars(detail.selectionFeeInCents),
        //       formatCentsAsDollars(detail.minimumPriceInCents ?? 0),
        //       formatCentsAsDollars(detail.priceInCents),
        //     );
        //   }
        // }

        const direct = change.rpogCostAndPrice[rpog.id];
        optionDetails.set(rpo, {
          costInCents: direct.costInCents,
          priceInCents: alt.priceInCents,
          // Pre/post-cutoff prices swap only this option's active price for its cutoff variant,
          // because cutoff dates are per-option (not global). All other options keep their active prices.
          preCutoffPriceInCents: alt.priceInCents - direct.priceInCents + direct.preCutoffPriceInCents,
          postCutoffPriceInCents: alt.priceInCents - direct.priceInCents + direct.postCutoffPriceInCents,
          changed,
        });

        // Record this selectedChange to update our baseline only after all options in this group
        if (rpo === selectedRpo) {
          selectedChange = change;
          selectedGroupsToPrice = groupsToPrice;
        }
      }
    }

    // We're done with this RPOG, so can do some state updates for the next one
    if (selectedRpo) {
      configSoFarSet.add(selectedRpo as LoadedOption);
      baselineRpoIds.add(selectedRpo.id);
      if (selectedChange && selectedGroupsToPrice) {
        // Merge the selected RPO's changed-group pricing into the baseline. Must iterate the same
        // groupsToPrice set used by the alt computation, not just rpogCostAndPrice entries — groups
        // in groupsToPrice without rpogCostAndPrice entries had their scope go to 0 (optional group
        // with no RPO in the altConfig), so we need to remove their baseline too.
        for (const groupId of selectedGroupsToPrice) {
          const key = groupId as ReadyPlanOptionGroupId;
          const entry = selectedChange.rpogCostAndPrice[key];
          baselineTotal = subCostAndPrice(baselineTotal, baselinePricing.get(key));
          const oldEntry = baselinePricing.get(key);
          if (oldEntry) baselineRpoIds.delete(oldEntry.rpo.id);
          if (entry) {
            baselineTotal = addCostAndPrice(baselineTotal, entry);
            baselinePricing.set(key, entry);
            baselineRpoIds.add(entry.rpo.id);
          } else {
            baselinePricing.delete(key);
          }
        }
      }
    }
    groupIdsSoFar.add(rpog.id);
  }

  return optionDetails;
}

/**
 * Fast-path pricing for a single RPOG where no RPO influences downstream defaults.
 *
 * Instead of calling `createValidAltConfig`/`fillInDefaults` per RPO, we swap one RPO ID in
 * the stable `baselineRpoIds` set and price only this group's direct scope. Returns the
 * selected RPO's change info (if any) for the caller to update the baseline.
 */
function priceRpogFastPath(
  scope: PricingScope,
  rpog: LoadedGroup,
  activeRpos: LoadedOption[],
  selectedRpo: ReadyPlanOption | undefined,
  baselinePricing: Map<ReadyPlanOptionGroupId, RpogBaselineEntry>,
  baselineTotal: CostAndPrice,
  baselineRpoIds: Set<ReadyPlanOptionId>,
  optionDetails: Map<LoadedOption, FullPriceOptionDetails>,
):
  | { selectedChange: ReturnType<typeof calcOptionsCostAndPrice>; selectedGroupsToPrice: Set<ReadyPlanOptionGroupId> }
  | undefined {
  const { logger } = scope;
  const prevEntry = baselinePricing.get(rpog.id);
  const prevRpoId = prevEntry?.rpo.id;

  let selectedChange: ReturnType<typeof calcOptionsCostAndPrice> | undefined;
  let selectedGroupsToPrice: Set<ReadyPlanOptionGroupId> | undefined;

  for (const rpo of activeRpos) {
    // Swap this group's RPO ID in the baseline set: remove the old, add the candidate
    if (prevRpoId) baselineRpoIds.delete(prevRpoId);
    baselineRpoIds.add(rpo.id);

    // Price only this RPO's direct scope against the stable baseline config
    const directRaw = calcOptionCostAndPrice(scope, baselineRpoIds, rpo);
    const direct = { ...directRaw, rpo: rpo as LoadedOption };

    // Full price = baselineTotal with only this group's entry swapped
    let alt = subCostAndPrice(baselineTotal, prevEntry);
    alt = addCostAndPrice(alt, direct);

    const changed: FullPriceOptionChange[] = [];
    if (scope.includeChanged) {
      changed.push({
        group: rpog,
        option: rpo as LoadedOption,
        previousOption: prevEntry?.rpo,
        prev: prevEntry,
        curr: direct,
        costChangeInCents: direct.costInCents - (prevEntry?.costInCents ?? 0),
        priceChangeInCents: direct.priceInCents - (prevEntry?.priceInCents ?? 0),
        selectionFeeChangeInCents: direct.selectionFeeInCents - (prevEntry?.selectionFeeInCents ?? 0),
        minimumPriceChangeInCents: (direct.minimumPriceInCents ?? 0) - (prevEntry?.minimumPriceInCents ?? 0),
      });
    }

    trace &&
      (trace === true || trace(rpo)) &&
      logger.debug(
        `   [fast] rpo=%s costInCents=%s priceInCents=%s`,
        formatRpo(rpo),
        formatCentsAsDollars(alt.costInCents),
        formatCentsAsDollars(alt.priceInCents),
      );

    optionDetails.set(rpo, {
      costInCents: direct.costInCents,
      priceInCents: alt.priceInCents,
      preCutoffPriceInCents: alt.priceInCents - direct.priceInCents + direct.preCutoffPriceInCents,
      postCutoffPriceInCents: alt.priceInCents - direct.priceInCents + direct.postCutoffPriceInCents,
      changed,
    });
    // Record the selected RPO's pricing for the baseline update below
    if (rpo === selectedRpo) {
      selectedChange = {
        costInCents: 0,
        priceInCents: 0,
        rpogCostAndPrice: { [rpog.id]: direct } as ReturnType<typeof calcOptionsCostAndPrice>["rpogCostAndPrice"],
      };
      selectedGroupsToPrice = new Set([rpog.id]);
    }
    // Restore the baseline set
    baselineRpoIds.delete(rpo.id);
    if (prevRpoId) baselineRpoIds.add(prevRpoId);
  }
  if (selectedChange && selectedGroupsToPrice) {
    return { selectedChange, selectedGroupsToPrice };
  }
  return undefined;
}

const prpcHint = {
  options: { readyPlanOption: rpoHint },
  includedOptions: rpoHint,
} satisfies LoadHint<ProjectReadyPlanConfig>;
/**
 * Determines which options are "included" in the base price for pricing calculations.
 * Priority order:
 * 1. PRPC.includedOptions - explicitly set included options on the structure - included in the includedPrice
 * 2. PRPC.options - the (current) contracted options on the structure - we can hopefully remove this once they are all backfilled
 * 3. POF baseConfig - the base house configuration if the structure has nothing set
 */
function getStructureOrBaseConfigOptions(
  prpc: Loaded<ProjectReadyPlanConfig, typeof prpcHint> | undefined,
  baseConfig: Loaded<ProductOfferingConfig, "readyPlanOptions"> | undefined,
  rpogs: LoadedGroup[],
): LoadedOption[] {
  // If the PRPC has explicit includedOptions set, use those as the "what's included in the price" baseline
  const prpcIncludedOptions = prpc?.includedOptions.get ?? [];
  // Otherwise fall back to the contracted options on the structure
  const structureOptions = prpc?.options.get ?? [];
  const maybePartialOptions = prpcIncludedOptions.nonEmpty
    ? prpcIncludedOptions
    : structureOptions.nonEmpty
      ? structureOptions.map((prpco) => prpco.readyPlanOption.get)
      : (baseConfig?.readyPlanOptions.get ?? []);
  // The Structure/POC config we loaded might be partial/out-of-date, and missing personalization options
  // that were later added to the POF. These options missing from our initial/included scope will throw off
  // pricing diffs, b/c the very first diff will "recover"/claim the missing option's price and so be more
  // expensive that it should be. To fix this, we can just fill in the missing options with defaults.
  // Safe to cast back to LoadedOption since received rpogs are already LoadedGroups so options returned will be LoadedOptions
  return fillInMissingOptionsImpl(rpogs, maybePartialOptions as LightOption[]) as LoadedOption[];
}

/**
 * Given a "reserved" (or "expired") checkout config, we can skip recalculating option pricing
 * or cutoffs and simply return the persisted values.
 */
async function getReservedOptionPricing(ccfg: CheckoutConfig): Promise<CheckoutPofPricing> {
  const { checkoutConfigOptions } = await withLoaded(
    ccfg.populate({ checkoutConfigOptions: { readyPlanOption: rpoHint } }),
  );
  // Replicate maps returned by `calcCurrentOptionPricing` from the stored/reserved data
  const optionDetails = new Map<ReadyPlanOption, PriceIncrease>();
  const optionCutoffs: OptionCutoffsMap = new Map();
  checkoutConfigOptions.forEach((ccfo) => {
    const rpo = ccfo.readyPlanOption.get;
    optionDetails.set(rpo, {
      isSelected: true,
      // We don't store "included" in the DB, but it shouldn't matter for reserved/expired results
      isIncluded: false,
      // code paths expecting reserved results only care about option price, so we can return 0 for cost
      costInCents: 0,
      priceInCents: ccfo.reservedPriceInCents ?? 0,
      preCutoffPriceInCents: ccfo.reservedPriceInCents ?? 0,
      postCutoffPriceInCents: ccfo.reservedPriceInCents ?? 0,
      fullPrice: undefined as any,
      availableCreditInCents: 0,
    });
    optionCutoffs.set(rpo.id, ccfo.reservedCutoffDate ?? undefined);
  });
  return {
    // code paths expecting reserved result only care about total price, so we can return 0 for everything else aside from totalPriceInCents & salesPriceInCents
    // TODO: Do we need to store basePriceInCents, baseCostInCents, totalCostInCents as well?
    baseCostInCents: 0,
    basePriceInCents: 0,
    totalCostInCents: 0,
    totalPriceInCents: ccfg.reservedTotalPriceInCents ?? 0,
    salesPriceInCents: ccfg.reservedSalesPriceInCents ?? 0,
    mhTotalPriceInCents: ccfg.reservedMhTotalPriceInCents ?? 0,
    aduTotalPriceInCents: ccfg.reservedAduTotalPriceInCents ?? 0,
    mhSalesPriceInCents: ccfg.reservedMhSalesPriceInCents ?? 0,
    aduSalesPriceInCents: ccfg.reservedAduSalesPriceInCents ?? 0,
    optionDetails,
    optionCutoffs,
    rpogsWithSlots: new Set<ReadyPlanOptionGroupId>(),
  };
}

/**
 * When a design package (spec level, scheme) is changed, reset personalization options to match.
 *
 * Note this is not "fill in missing options", if you want current selections to be respected, i.e.
 * because a structural option was chosen, use `fillInMissingOptions` instead.
 */
export function resetWithDefaultsImpl(
  originalOptions: readonly ReadyPlanOption[],
  options: LoadedOption[],
  includedByMap?: LightOptionMap,
): LoadedOption[] {
  // Order the options by group, i.e. get Spec Level first, before Appliance Package
  const selectedOptions = options.sortBy((rpo) => rpo.optionGroup.get.order);

  // Changing Interior Scheme/Spec Level can reset personalization RPOGs, i.e. Premium gets sink2 instead of sink1
  const addedOptions = selectedOptions.difference(originalOptions as LoadedOption[]);
  const isAnyDesignPackageChange = addedOptions.some((rpo) => {
    const type = (rpo.optionGroup.get as LoadedGroup).group.get.type.get;
    return type.forDesignExterior || type.forDesignInterior;
  });
  if (!isAnyDesignPackageChange) return options;

  // Instead of looking through `pof.optionGroups` for "active / checkout-enabled / etc."
  const [regularRpogs, personalizationRpogs] = options
    .map((rpo) => rpo.optionGroup.get)
    .partition((rpog) => !rpog.personalizationType);

  // Rebuild up the config by:
  // - Keep all selected options for regularRpogs
  // - Add brand-new options for personalizationRpogs
  const configSoFar = new Set(selectedOptions.filter((rpo) => regularRpogs.includes(rpo.optionGroup.get)));
  fillInDefaults(configSoFar, personalizationRpogs as LightGroup[], includedByMap);
  return [...configSoFar];
}

/**
 * Given a partial `configSoFar`, fill in options for `remainingGroup`, based on defaults.
 *
 * Note this is not "fill in missing options" -- we do not (anymore) accept a parameter of "current options
 * to preserve", this function is only for "reset a config to defaults", for either:
 *
 * - The pricing algorithm needing to price out "ElevationA + defaults", "ElevationA + SchemeB + defaults", etc., or
 * - Either CheckoutConfig or ProductOfferingConfigs that have "changed a spec level" and explicitly want to reset
 *   their personalization options to the new package defaults.
 *
 * This is necessary b/c even though the base/included config has "all (required) options", once the user
 * goes "off-script" and picks a different package option (i.e. Spec Level Premium instead of Essential),
 * we need to swap over the downstream defaults.
 *
 */
function fillInDefaults(
  configSoFar: Set<LightOption>,
  remainingGroups: LightGroup[],
  includedByMap?: LightOptionMap,
): LightOptionMap {
  // id → option lookup for prereq/conflict checks and matchingDefaults
  const configSoFarMap: LightOptionMap = new Map();
  // which RPOGs we've filled so far, for hasGroupPrereq / isValidConfig.
  const groupsSoFarSet = new Set<ReadyPlanOptionGroup>();
  // option codes we've seen, for maybeHardcodedRequiredAddons and related logic.
  const codes = new Set<string>();
  const hros = remainingGroups.length > 0 ? getHardcodedRequiredOptions(withLoaded(remainingGroups[0]).readyPlan) : [];

  for (const rpo of configSoFar) {
    configSoFarMap.set(rpo.id, rpo);
    groupsSoFarSet.add(rpo.optionGroup.get);
    codes.add(rpo.code.get);
  }
  for (const rpog of remainingGroups) {
    // Look for required addons that we don't support in the domain model yet
    const maybeHardCodedRequiredAddon = maybeHardcodedRequiredAddons(configSoFarMap, rpog, codes, hros);
    // For RPOGs what have Required Addons, evaluate their target combinations, i.e. turn on AddWasher based on SpecLevel
    // (this assumes that SpecLevel/etc sorts before Addons, so they're in configSoFar already, which is currently true)
    const maybeMatchingRequiredOption = maybeMatchingRequiredOptions(configSoFarMap, rpog);
    // For required, or optional-but-prereq-met rpogs, prefer their defaults
    const maybeMatchingDefault =
      rpog.required || hasGroupPrereq(groupsSoFarSet, rpog) ? matchingDefaults(configSoFarMap, rpog) : undefined;
    // Otherwise for required RPOGs, just "the first one that works"
    const maybeRequiredDefault = rpog.required ? rpog.options.get.filter((rpo) => rpo.active) : [];
    const candidates = [
      maybeHardCodedRequiredAddon?.rpo,
      maybeMatchingRequiredOption?.rpo,
      maybeMatchingDefault?.rpo,
      ...maybeRequiredDefault,
    ]
      .compact()
      .unique();
    // We may not find a default/included/required option, which is fine if not...
    const winner = candidates.find((rpo) => isValidConfig(configSoFarMap, groupsSoFarSet, rpo));

    if (winner) {
      configSoFar.add(winner);
      codes.add(winner.code.get);
      configSoFarMap.set(winner.id, winner);
      groupsSoFarSet.add(rpog);
      // Track which option directly included this one (the last/most-direct includer in the chain)
      if (includedByMap) {
        const directEnabler = findDirectEnabler(
          winner,
          maybeHardCodedRequiredAddon,
          maybeMatchingRequiredOption,
          maybeMatchingDefault,
        );
        if (directEnabler) {
          includedByMap.set(winner.id, directEnabler);
        }
      }
    }
  }
  return configSoFarMap;
}

/**
 * Our `ReadyPlanRequiredOption` domain model only supports dependencies on Design Packages,
 * but we need to auto-enable/disable addons based on Personalization Options & other Addons.
 */
export type HardcodedRequiredOption = {
  /** Whether `code` is the RPO this HRO controls/auto-enabled/disables. */
  controls(code: string): boolean;
  /** Whether the current config `codes` should trigger this HRO being enabled. */
  matches(codes: Set<string>): boolean;
  /** Whether `codes` being removed should trigger maybe-removing/turning off this HRO. */
  triggeredBy(codes: Set<string>): boolean;
};

// Eaton Fire fireplaces
// When (hasGasFireplace || hasElectricFireplace) && (JanesPremium || Organic) ==> Add Slab Upgrade
// "code": "SPEC-Essential" "displayName": "SPEC-Essential - Essential"
// "code": "SPEC-Deluxe", "displayName": "SPEC-Deluxe - Deluxe"
// "code": "SPEC-Premium", "displayName": "SPEC-Premium - Premium"
// "code": "DSGNPKG013", "displayName": "DSGNPKG013 - Transitional Organic",
// "code": "DSGNPKG094", "displayName": "DSGNPKG094 - Jane's Cottage",
// "code": "FIREPLCT001", "displayName": "FIREPLCT001 - Slab Surround Fireplace Upgrade - Great Room 108",
// "code": "FIREPLCE1", "displayName": "FIREPLCE1 - Add 36\" Gas Fireplace - Great Room 108",
// "code": "FIREPLCE4", "displayName": "FIREPLCE4 - Add 30\" Electric Fire Place - Great Room 108",
class EatonFirePlaces implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "FIREPLCT001"; // isFireplaceSlabUpgrade
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return ((_.isJanes && _.isPremium) || _.isOrganic) && (_.hasGasFireplace || _.hasElectricFireplace);
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.isJanes || _.isPremium || _.isOrganic || _.hasGasFireplace || _.hasElectricFireplace;
  }
  #parse(codes: Set<string>) {
    const isJanes = codes.has("DSGNPKG094");
    const isPremium = codes.has("SPEC-Premium");
    const isOrganic = codes.has("DSGNPKG013");
    const hasGasFireplace = codes.has("FIREPLCE1");
    const hasElectricFireplace = codes.has("FIREPLCE4");
    return { isJanes, isPremium, isOrganic, hasGasFireplace, hasElectricFireplace };
  }
}

// Eaton Fire Range
// When Deluxe||Premium ==> Add Range Upgrade
// code: AP002 Deluxe Kitchen Appliance Package
// code: AP003 Premium Kitchen Appliance Package
// code: INTKITAPP1 Range Upgrade
class EatonFireRange implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "INTKITAPP1"; // isRangeUpgrade
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return _.hasDeluxeAP || _.hasPremiumAP;
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.hasDeluxeAP || _.hasPremiumAP;
  }
  #parse(codes: Set<string>) {
    const hasDeluxeAP = codes.has("AP002");
    const hasPremiumAP = codes.has("AP003");
    return { hasDeluxeAP, hasPremiumAP };
  }
}

// Eaton Fire Deluxe Hoods (moves the microwave from above the range to a drawer, and so requires a different hood)
// code: AP002 Deluxe Kitchen Appliance Package
// code: MICRODR001 Microwave Drawer Upgrade (i.e. Stainless Hood)
class EatonFireDeluxeHood implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "MICRODR001";
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return _.hasDeluxeAP || _.hasPremiumAP;
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.hasDeluxeAP || _.hasPremiumAP;
  }
  #parse(codes: Set<string>) {
    const hasDeluxeAP = codes.has("AP002");
    const hasPremiumAP = codes.has("AP003");
    return { hasDeluxeAP, hasPremiumAP };
  }
}

// Eaton Fire Hoods
// code: AP003 Premium Kitchen Appliance Package
// code: DECHOOD001 Decorative Hood Upgrade
class EatonFirePremiumHood implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "DECHOOD001";
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return _.hasPremiumAP && !_.hasInteriorOrganic && !_.hasInteriorSpanish;
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.hasPremiumAP || _.hasInteriorOrganic || _.hasInteriorSpanish;
  }
  #parse(codes: Set<string>) {
    const hasPremiumAP = codes.has("AP003");
    const hasInteriorOrganic = codes.has("DSGNPKG013");
    const hasInteriorSpanish = codes.has("DSGNPKG093");
    return { hasPremiumAP, hasInteriorOrganic, hasInteriorSpanish };
  }
}

// Square Drywall Decorative hood, for Transitional Organic DSGNPKG013
class EatonFirePremiumHood2 implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "DECHOOD002";
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return _.hasPremiumAP && _.hasInteriorOrganic;
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.hasPremiumAP || _.hasInteriorOrganic || _.hasInteriorSpanish;
  }
  #parse(codes: Set<string>) {
    const hasPremiumAP = codes.has("AP003");
    const hasInteriorOrganic = codes.has("DSGNPKG013");
    const hasInteriorSpanish = codes.has("DSGNPKG093");
    return { hasPremiumAP, hasInteriorOrganic, hasInteriorSpanish };
  }
}

// Legged Drywall Decorative hood, for Spanish DSGNPKG093
class EatonFirePremiumHood4 implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "DECHOOD004";
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return _.hasPremiumAP && _.hasInteriorSpanish;
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.hasPremiumAP || _.hasInteriorOrganic || _.hasInteriorSpanish;
  }
  #parse(codes: Set<string>) {
    const hasPremiumAP = codes.has("AP003");
    const hasInteriorOrganic = codes.has("DSGNPKG013");
    const hasInteriorSpanish = codes.has("DSGNPKG093");
    return { hasPremiumAP, hasInteriorOrganic, hasInteriorSpanish };
  }
}

/** Enable ADU Flooring = Engineered Hardwood when any Premium ADU is selected. */
class EatonFireAduPremium implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "LVP2HRWDADU";
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return _.hasPremiumADU;
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.hasPremiumADU;
  }
  #parse(codes: Set<string>) {
    const hasPremiumADU =
      codes.has("Spanish Premium ADU") ||
      codes.has("Jane's Cottage Premium ADU") ||
      codes.has("Transitional Organic Premium ADU") ||
      codes.has("Craftsman Premium ADU");
    return { hasPremiumADU };
  }
}

/** Test Suite RangeUpgrade. */
class TestSuiteRangeUpgrade implements HardcodedRequiredOption {
  controls(code: string) {
    return code === "RangeUpgrade";
  }
  matches(config: Set<string>): boolean {
    const _ = this.#parse(config);
    return _.hasPremiumAP;
  }
  triggeredBy(removed: Set<string>): boolean {
    const _ = this.#parse(removed);
    return _.hasPremiumAP;
  }
  #parse(codes: Set<string>) {
    const hasPremiumAP = codes.has("APPremium");
    return { hasPremiumAP };
  }
}

const hardcodedRequiredOptionsByDpId: Record<DesignPackageId, HardcodedRequiredOption[]> = {
  // Eaton Fire - Interior
  "rp:2076": [
    new EatonFirePlaces(),
    new EatonFireRange(),
    new EatonFireDeluxeHood(),
    new EatonFirePremiumHood(),
    new EatonFirePremiumHood2(),
    new EatonFirePremiumHood4(),
    new EatonFireAduPremium(),
  ],
  // HROs for unit tests
  test: [new TestSuiteRangeUpgrade()],
};

/**
 * Returns the hardcoded required options for a given `ReadyPlan`.
 *
 * If the `ReadyPlan` is a `ProductOffering`, it will return the hardcoded required options for the interior and exterior design packages.
 * If the `ReadyPlan` is a `DesignPackage`, it will return the hardcoded required options for the design package.
 */
export function getHardcodedRequiredOptions(rp: ReadyPlan): HardcodedRequiredOption[] {
  // If the RP ID is very small, assume it's a unit test
  if (parseInt(rp.idUntagged) < 10) return hardcodedRequiredOptionsByDpId.test;
  return rp instanceof ProductOffering
    ? [
        ...(hardcodedRequiredOptionsByDpId[rp.interiorDesignPackage.id] ?? []),
        ...(hardcodedRequiredOptionsByDpId[rp.exteriorDesignPackage.id] ?? []),
      ]
    : (hardcodedRequiredOptionsByDpId[rp.id] ?? []);
}

function maybeHardcodedRequiredAddons(
  configSoFar: LightOptionMap,
  rpog: LightGroup,
  codes: Set<string>,
  hros: HardcodedRequiredOption[],
): OptionWithIncludedBy | undefined {
  // Early exit if no HROs for this ReadyPlan
  if (hros.isEmpty) return;

  const { options: rpos } = withLoaded(rpog);
  const candidates = rpos.filter((rpo) => rpo.active);
  for (const rpo of candidates) {
    for (const hro of hros) {
      if (
        hro.controls(rpo.code.get) &&
        hro.matches(codes) &&
        // If this is `UpgradePowderFloor`, make sure its prereq `AddPowder` is also selected
        rpo.optionPrerequisites.get
          .groupByObject((prereq) => prereq.optionGroup.id)
          .every(([, prereqsInGroup]) => prereqsInGroup.some((prereq) => configSoFar.has(prereq.id)))
      ) {
        // Extract enabling options - options whose codes are part of what triggers this HRO
        const enablingOptions = configSoFar
          .values()
          .filter((opt) => {
            const singleCode = new Set([opt.code.get]);
            return hro.triggeredBy(singleCode);
          })
          .toArray();
        return { rpo, includedBy: enablingOptions };
      }
    }
  }
}

/**
 * Enables required options, by looking at each rpo in rpog & seeing if it's enabled by a matching RPRO.
 *
 * I.e. with `configSoFar=[SpecLevel], then return `sink1` if `sink1.optionRequiredIf=[[SpecLevel:Premium]]`.
 */
function maybeMatchingRequiredOptions(configSoFar: LightOptionMap, rpog: LightGroup): OptionWithIncludedBy | undefined {
  // We used to check `rpo.showInCheckout` here, but actually we want "not visible to the HO" options
  // to still be "turn-on able" by A&D in the design package
  const candidates = rpog.options.get.filter(
    (rpo) => rpo.active && rpo.optionRequiredIf.get.filter((requiredIf) => requiredIf.active).nonEmpty,
  ) as LightOption[];
  if (candidates.isEmpty) return;
  for (const rpo of candidates) {
    // When looking at `rpo=SlabUpgrade`, it could have multiple `RPRO`s, for each active rpro, see if it matches
    for (const rpro of rpo.optionRequiredIf.get.filter((rpro) => rpro.active)) {
      const matchingCombo = rpro.targetCombinations.find((combo) => combo.every((id) => configSoFar.has(id)));
      if (matchingCombo) {
        // When looking at `rpo=UpgradePowderFloor`, it could have a prereq like `AddPowder` that we don't have
        const prereqsMet = rpo.optionPrerequisites.get
          .groupByObject((prereq) => prereq.optionGroup.id)
          .every(([, prereqsInGroup]) => prereqsInGroup.some((prereq) => configSoFar.has(prereq.id)));
        if (prereqsMet) {
          const enablingOptions = matchingCombo.map((id) => configSoFar.get(id)).compact() as LightOption[];
          return { rpo, includedBy: enablingOptions };
        }
      }
    }
  }
  return;
}

/**
 * Finds the first DP-driven default option for `rpog` based on `configSoFar`.
 *
 * I.e. with `configSoFar=[SpecLevel], then default on `sink1`.
 */
function matchingDefaults(configSoFar: LightOptionMap, rpog: LightGroup): OptionWithIncludedBy | undefined {
  const candidates = rpog.options.get.filter((rpo) => rpo.active) as LightOption[];
  // Check the new targetCombos first
  for (const rpo of candidates) {
    for (const combo of rpo.personalizationTargetCombinations) {
      if (combo.every((id) => configSoFar.has(id))) {
        const enablingOptions = combo.map((id) => configSoFar.get(id)).compact() as LightOption[];
        return { rpo, includedBy: enablingOptions };
      }
    }
  }
  // Then look at the old-but-not-gone optionDefaultsIf
  for (const rpo of candidates) {
    for (const def of rpo.optionDefaultsIf.get) {
      const matchingOption = configSoFar.get(def.id);
      if (matchingOption) {
        return { rpo, includedBy: [matchingOption] };
      }
    }
  }
  // If we're a personalization RPOG, we might be misconfigured w/"No Product" (like Epoxy Finish), which product
  // wants to mean "there is not a default" not "there is literally no product" :shrug: so return the first option
  if (rpog.personalizationType) {
    return { rpo: candidates[0], includedBy: [] };
  }
  return;
}

function hasGroupPrereq(groupsSoFarSet: Set<ReadyPlanOptionGroup>, rpog: ReadyPlanOptionGroup): boolean {
  const g = rpog as LightGroup;
  return g.groupPrerequisites.get.nonEmpty && g.groupPrerequisites.get.some((gp) => groupsSoFarSet.has(gp));
}

/** Snapshots the "reserved" price at the option and CheckoutConfig level in order to lock in pricing at the time of reservation. */
export async function snapshotReservedOptionData(ccfg: CheckoutConfig): Promise<void> {
  const { em } = ccfg;
  // Creating a new checkout config directly in the reserved state only happens in tests
  // Because we need the entity persisted (with an ID) to bridge both entity managers we will just skip this logic
  if (ccfg.isNewEntity) {
    em.ctx.logger.warn("Skipping snapshotReservedOptionData for new checkout config %s", ccfg);
    return;
  }
  const { checkoutConfigOptions } = await withLoaded(ccfg.populate({ checkoutConfigOptions: { readyPlanOption: {} } }));
  const {
    mhTotalPriceInCents,
    mhSalesPriceInCents,
    aduTotalPriceInCents,
    aduSalesPriceInCents,
    optionDetails,
    optionCutoffs,
  } = await calcCheckoutCostAndPrice(ccfg);
  // Update existing CheckoutConfigOptions with the new fields
  checkoutConfigOptions.forEach((ccfo) => {
    const rpo = ccfo.readyPlanOption.get;
    const rpoDetail = optionDetails.get(rpo);
    if (rpoDetail) {
      const { priceInCents } = rpoDetail;
      ccfo.set({ reservedPriceInCents: priceInCents, reservedCutoffDate: optionCutoffs.get(rpo.id) });
    }
  });
  ccfg.set({
    reservedMhTotalPriceInCents: mhTotalPriceInCents,
    reservedMhSalesPriceInCents: mhSalesPriceInCents,
    reservedAduTotalPriceInCents: aduTotalPriceInCents,
    reservedAduSalesPriceInCents: aduSalesPriceInCents,
  });
}

/**
 * Reimplementation of ReadyPlan.isValidConfiguration with some customizations. Specifically:
 *
 * - Works with only partial configs so we can valid-as-we-go (unlike isValidConfiguration),
 * - Validates only a single, newly-added RPO at a time (skip re-validating existing RPOs over & over), and
 * - Implements the "infer cross-Interior/Exterior DP Elevation/Interior Scheme" prereqs hack, see inline comments
 */
function isValidConfig(
  configSoFar: LightOptionMap,
  groupsSoFarSet: Set<ReadyPlanOptionGroup>,
  newRpo: LightOption,
): boolean {
  // Since we're only validating `newRpo` (and not every rpo in `configSoFar`), check both `optionConflicts`
  // and `optionConflictChildren` for good measure, even though in-theory `optionConflictChildren` would only
  // point to "downstream" rpos that we haven't gotten to it; but doesn't hurt.
  const { optionConflicts, optionConflictChildren } = withLoaded(newRpo);
  const hasConflict =
    optionConflicts.some((c) => configSoFar.has(c.id)) || optionConflictChildren.some((c) => configSoFar.has(c.id));

  const type = (newRpo.optionGroup.get as LightGroup).group.get.type.get;
  const isDpRpog = type.forDesignInterior || type.forDesignExterior;

  // Group-aware prerequisite checking similar to ReadyPlan.isValidConfiguration
  const prereqsByGroup = [
    // If we're adding `SpecLevel=Premium`, see if it has a direct prereq of `InteriorScheme=...` / `Elevation=...`
    ...newRpo.optionPrerequisites.get,
    // And also look for "transitive prereqs".
    //
    // I.e. if newRpo is `InteriorScheme=Farmhouse` (interior DP), it may not have a direct prereq on `Elevation`
    // (b/c Elevations are in the exterior DP), but if we look at "who requires InteriorScheme=Farmhouse", we'll find
    // `SpecLevel=Deluxe` (from Interior DP config), and `SpecLevel=Deluxe` might *also* have prereqs on `Elevation`
    // (setup in the Exterior DP config) that we should consider as effective/transitive prereqs for
    // `InteriorScheme=Farmhouse`.
    //
    // Essentially we're inferring `InteriorScheme -> Elevation` prereqs, which cannot be directly configured across
    // the Exterior/Interior DPs, but can happen indirectly from `SpecLevel` prereqs in both the Interior/Exterior DP
    // configs.
    //
    // ...disclaimer, this is a bit hacky, and only works for Design Package prereqs b/c of the way we exhaustively
    // configure SpecLevel prereqs in the DP UX; i.e. this `optionPrereqChildren` would normally not be safe b/c
    // prereqs are optional, i.e. we may not actually add the `optionPrereqChildren` to the config, so normally we
    // don't want to consider their prereqs yet. *But* b/c SpecLevels exhaustively specify their prereqs, and we
    // "allow any group", we might go `InteriorScheme -> three Spec Levels -> Elevations` and so handle "any
    // possible spec level" being selected.
    //
    // If we do not check "prereq lookahead", when incrementally building configs, we might commit to an `Interior
    // Scheme=Farmhouse` that "looks fine atm", but once we get to `SpecLevel` end up with no valid configs, because
    // `Deluxe` was disqualified by `Elevation=Scandinavian` but `Premium` was also disqualified by
    // `InteriorScheme=Farmhouse`, which we didn't know we should have skipped.
    ...(isDpRpog
      ? newRpo.optionPrereqChildren.get
          .flatMap((child) => (child as LightOption).optionPrerequisites.get)
          .filter((prereq) => prereq !== newRpo)
      : []),
  ].groupByObject((prereq) => prereq.optionGroup.get);
  const groupsWithoutPrereqs = prereqsByGroup.filter(([group, prereqs]) => {
    // A little odd, but we check `groupsSoFarSet.has(group)` b/c the above "look at prereq children then back up" might
    // accidentally pull in prereqs we don't even have groups for yet, i.e.
    // We're checking `isValidConfig([Elevation])`, looking "downstream" we find a SpecLevel optionPrereqChild, which
    // has an optionPrereq of Interior Scheme, but we've not gotten to filling in Interior Scheme yet, so ignore it.
    return groupsSoFarSet.has(group) && prereqs.nonEmpty && !prereqs.some((p) => configSoFar.has(p.id));
  });
  const missingPrereq = groupsWithoutPrereqs.nonEmpty;

  // Could probably check groupPrerequisites here...
  return !hasConflict && !missingPrereq;
}

export type CallbackFn<T, R = any> = (element: T) => R;

/** Similar to groupBy, but `fn` can return multiple values. */
function indexBy<T, O, Y = T>(arr: readonly T[], fn: (element: T) => O[], valueFn?: CallbackFn<T, Y>): Map<O, Y[]> {
  const result = new Map<O, Y[]>();
  for (const e of arr) {
    const value = valueFn ? valueFn(e) : (e as any as Y);
    for (const key of fn(e)) {
      let group = result.get(key);
      if (group === undefined) {
        group = [];
        result.set(key, group);
      }
      group.push(value);
    }
  }
  return result;
}

/** Calc only the total cost and price of some set of scope. */
function calcBaseHouseCostAndPrice(tlivs: TlivPojo[]) {
  let baseHouseCost = 0;
  let baseHousePrice = 0;
  // use a single for loop for performance
  for (const tliv of tlivs) {
    const marginInBasisPoints = getMarginFromMaterialCatalog(tliv);
    const { leveledUnitCostInCents, quantity = 1, totalCostInCents } = tliv;
    const tlivCostInCents = isDefined(leveledUnitCostInCents) ? leveledUnitCostInCents * quantity : totalCostInCents;
    baseHouseCost += tlivCostInCents;
    baseHousePrice += addMargin(tlivCostInCents, marginInBasisPoints);
  }
  return { baseHouseCost, baseHousePrice };
}

/**
 * Given a `fullConfig`, calculate the price of each `optionsToPrice` based on per-option/per-material margins.
 *
 * I.e. this uses the "last option wins" cost/price attribution and doesn't have any drift-based,
 * incremental pricing like the main `calcPofOptionsCostAndPrice` function.
 */
function calcOptionsCostAndPrice(
  scope: PricingScope,
  fullConfig: ReadyPlanOption[],
  optionsToPrice: ReadyPlanOption[] = fullConfig,
): CostAndPrice & {
  rpogCostAndPrice: Record<string, OptionCostAndPriceAndSelectionFee & { rpo: LoadedOption; tlivs: TlivPojo[] }>;
} {
  // Given tlivsByOption is "scope grouped by option", go through each group of scope and calc
  // the margin/price for a) each line of scope, and b) the total those to get the price of the option.
  const rpoIds = new Set(idsOf(fullConfig));
  type RpogEntry = OptionCostAndPriceAndSelectionFee & { rpo: LoadedOption; tlivs: TlivPojo[] };
  const rpogCostAndPrice: Record<string, RpogEntry> = {};
  let result = costAndPrice(0, 0);
  for (const rpo of optionsToPrice) {
    const option = calcOptionCostAndPrice(scope, rpoIds, rpo);
    result = addCostAndPrice(result, option);
    rpogCostAndPrice[rpo.optionGroup.id] = { ...option, rpo: rpo as LoadedOption } as RpogEntry;
  }
  return { ...result, rpogCostAndPrice };
}

function calcOptionCostAndPrice(
  scope: PricingScope,
  rpoIds: Set<ReadyPlanOptionId>,
  rpo: ReadyPlanOption,
): OptionCostAndPriceAndSelectionFee & { tlivs: TlivPojo[] } {
  assertUnsafeLoaded(rpo, { selectionFeeInCents: {}, optionGroup: { group: "type" } });
  // `scopeLastByOptions` has all TLIVs that *could* match, use `isMatchingTliv` to get actual matches
  const tlivs: TlivPojo[] = [];
  for (const tliv of scope.scopeByLastOptions.get(rpo.id) ?? []) {
    if (isMatchingTliv(tliv, rpoIds)) tlivs.push(tliv);
  }

  // Even if there are no tlivs, we might have minimum fees, so keep going
  // if (tlivs.isEmpty) return

  const type = rpo.optionGroup.get.group.get.type.get;
  // Addon/Structural have option-wide margins, so calc their price differently
  const { costInCents, priceInCents, preCutoffPriceInCents, postCutoffPriceInCents, minimumPriceInCents } =
    type.isAddOnV2 || type.isStructuralV2
      ? calcOptionScopePrice(scope.logger, scope.optionCutoffs, rpo, tlivs)
      : calcCatalogScopePrice(scope.logger, tlivs);

  // Add material selection fees for personalization options that are selected but not included
  // (go through the cache b/c we might have to sum quantities b/c of `shouldMultiplySelectionFee`)
  const materialFees = scope.optionToMaterialSelectionFee.get(rpo.id);
  const totalMaterialFeeInCents = scope.leveledOptionGroups.has(rpo.optionGroup.get)
    ? 0 // Material selection fees on leveled RPOGs not supported since it would break the leveling logic as implemented.
    : (materialFees?.sum((fee) => fee.totalSelectionFeeInCents) ?? 0);
  // Add in the selectionFeeInCents on top of scope cost
  const maybeSelectionFee = rpo.selectionFeeInCents.get + totalMaterialFeeInCents;

  return {
    tlivs,
    costInCents,
    priceInCents: priceInCents + maybeSelectionFee,
    preCutoffPriceInCents: preCutoffPriceInCents + maybeSelectionFee,
    postCutoffPriceInCents: postCutoffPriceInCents + maybeSelectionFee,
    selectionFeeInCents: maybeSelectionFee,
    minimumPriceInCents,
  };
}

/** Addons/Structural options have a single option-wide margin we apply across all costs. */
function calcOptionScopePrice(
  logger: Logger,
  cutoffs: OptionCutoffsMap,
  rpo: ReadyPlanOption,
  tlivs: TlivPojo[],
): OptionCostAndPriceAndSelectionFee {
  assertUnsafeLoaded(rpo, rpoHint);
  const costInCents = tlivs.sum((tliv) => tliv.totalCostInCents);
  const addMarginAndMin = (cost: number, margin: number) =>
    Math.max(addMarginWithRounding(logger, cost, margin), rpo.minimumPriceInCents.get);
  // Apply minimum price logic - ensure we never sell for less than minimum
  const preCutoffPriceInCents = addMarginAndMin(costInCents, rpo.preCutoffDesiredMarginInBasisPoints.get);
  const postCutoffPriceInCents = addMarginAndMin(costInCents, rpo.postCutoffDesiredMarginInBasisPoints.get);
  // Determine which cutoff price to use based on today's date
  const priceInCents = cutoffs.get(rpo.id)?.isAfter(todayPT()) ? postCutoffPriceInCents : preCutoffPriceInCents;
  return {
    costInCents,
    priceInCents,
    preCutoffPriceInCents,
    postCutoffPriceInCents,
    minimumPriceInCents: rpo.minimumPriceInCents.get,
    selectionFeeInCents: 0, // unhandled by caller
    tlivs,
  };
}

/** Non-addon/structural options have per-line margins from the material catalog, so we round as we go? */
function calcCatalogScopePrice(logger: Logger, tlivs: TlivPojo[]): OptionCostAndPriceAndSelectionFee {
  let costInCents = 0;
  let priceInCents = 0;
  for (const tliv of tlivs) {
    costInCents += tliv.totalCostInCents;
    priceInCents += addMarginWithRounding(logger, tliv.totalCostInCents, tliv.marginInBasisPoints);
  }
  // Cutoffs don't matter to products, so the price is all the same
  return {
    costInCents,
    priceInCents,
    preCutoffPriceInCents: priceInCents,
    postCutoffPriceInCents: priceInCents,
    // Scope catalog pricing doesn't have a min price, but make our shape match the calcOptionScopePrice
    minimumPriceInCents: undefined,
    selectionFeeInCents: 0, // unhandled by caller
    tlivs,
  };
}

function getMarginFromMaterialCatalog(tliv: TlivPojo): number {
  const { materialVariant } = tliv;
  return materialVariant?.preCutoffDesiredMarginInBasisPoints ?? 40_00; // Default to 40% margin if no MV exists - this means we are on a labor line item
}

/**
 * Returns the `[baseHousePrice, includedPrice]`.
 *
 * - If `salesPriceInCents` is set, it becomes the initial `includedPrice`, and we use it to infer `baseHousePrice`
 * - If `salesPriceInCents` is unset, we calc `baseHousePrice`, and use it to infer the initial `includedPrice`
 */
function calcStartingCostsAndPrices(
  scope: PricingScope,
  includedOptions: LoadedOption[],
  salesPriceInCents: number | undefined,
) {
  // Calc the per-option cost/price for all included/selected, before our fancy drift/stacking/etc. logic kicks in
  const { costInCents, priceInCents } = calcOptionsCostAndPrice(scope, includedOptions);
  if (salesPriceInCents) {
    // If sales typed in "price of this config = $850k", we infer the `baseHousePrice` as $850k minus the known price
    // of that config's options (i.e. it had `SL:Essential` and `Add Bedroom` selected, which we know the price).
    //
    // This gets us a "base house price" that, since it's inferred from the "Included" set of option, means as we
    // add/remove options in `selectedOptions`, the math of deltas from "this config's $850k sales price +/- your
    // personalization changes = new total price of $x" will line up.
    const baseHousePrice = salesPriceInCents - priceInCents;
    const baseHouseCost = scope.baseHouseCost;
    const salesCostInCents = baseHouseCost + costInCents;
    return { baseHousePrice, salesPriceInCents, baseHouseCost, salesCostInCents };
  } else {
    // Otherwise if no human-/sales-entered price is available, just use our own base house price
    const baseHousePrice = roundToPriceIncrement(scope.baseHousePrice);
    const baseHouseCost = scope.baseHouseCost;
    const salesPriceInCents = baseHousePrice + priceInCents;
    const salesCostInCents = baseHouseCost + costInCents;
    return { baseHousePrice, salesPriceInCents, baseHouseCost, salesCostInCents };
  }
}

/**
 * Creates a "next full config" start from `configSoFarSet` + `rpo` + defaults the rest.
 *
 * This basically recreates the "included" config *including* the `rpo`, without considering what
 * the actual/selected downstream rpos where, b/c they need to have their own "drift from (this new)
 * included" calculated.
 *
 * Usually this is just `configSoFar + rpo + fillInDefaults` but we also have to watch for alternate
 * options (Add Bedroom) that conflict with `configSoFar` options (conflicts/disables Add Loft).
 */
function createValidAltConfig(
  remainingGroups: Set<LoadedGroup>,
  configSoFarSet: Set<LoadedOption>,
  rpo: LoadedOption,
  scope: PricingScope,
): LoadedOption[] {
  const { includePrereqOptions } = scope;
  assertLoaded(rpo, ["optionConflicts", "optionConflictChildren"]);

  // If the rpo has prereqs that aren't in configSoFarSet, add them so downstream pricing sees a valid config
  // (e.g. AddADUFrenchDoor requires AddADU, so scope lines tagged with options=[AddADU,AddADUFrenchDoor]
  // need both enabled to be counted).
  //
  // Technically this only matters to the cost/pricing report, b/c for checkout, if we get to AddADUFrenchDoor
  // and the prereq AddADU is not enabled, then we won't show the user the french door option anyway so we make this
  // a conditional check.
  let missingPrereqs = [] as LoadedOption[];
  if (includePrereqOptions) {
    const { optionGroup, optionPrerequisites } = withLoaded(rpo);
    const { groupPrerequisites } = withLoaded(unsafeLoaded(optionGroup, { groupPrerequisites: rpogHint }));
    if (optionPrerequisites.nonEmpty || groupPrerequisites.nonEmpty) {
      missingPrereqs = [
        ...(optionPrerequisites as LoadedOption[])
          // We have to `groupByObject` b/c SpecLevel:Premium might have 4 prereqs on each InteriorScheme,
          // and we likely already have an InteriorScheme selection, and don't want to add the other three.
          .groupByObject((rpo) => rpo.optionGroup.get)
          // We could potentially check `remainingGroups.includes(group)` but this would not catch getting to
          // AddADUFrenchDoor and having to "reach back" to turn on our AddADU structural prereq, which was a group
          // we've already evaled awhile ago.
          .values()
          .filter(([, prereqsInGroup]) => !prereqsInGroup.some((p) => configSoFarSet.has(p as LoadedOption)))
          // Just pick the first one?
          .map(([, prereqsInGroup]) => prereqsInGroup[0]),
        // .filter((prereq) => !configSoFar.includes(prereq as LoadedOption)),
        // .filter((prereq) => !configSoFar.includes(prereq as LoadedOption)),
        // See if ChooseWasher is missing an AddWasher
        ...groupPrerequisites
          .values()
          .filter((rpog) => !rpog.options.get.some((rpo) => configSoFarSet.has(rpo as LoadedOption)))
          .map((rpog) => rpog.options.get[0]),
      ];
    }
  }

  // If we don't remove any conflicts, we'll throw off pricing because of scenarios like:
  // - addon1/rpog:10 comes first (and is in the included/selected options), and gets priced with itself + downstream scope like design packages/personalization
  // - addon2/rpog:11 comes next (and is an alt option, but we show the price-to-swap), and adds itself to `configSoFar`, but when we call `fillInDefaults`, "add downstream design package scope"
  //   fails b/c it thinks "adding this (design package rpo) would create an invalid config", when really the config is already invalid.
  //   because of the addon1/addon2 conflict
  const conflictingOptions = new Set(
    rpo.optionConflicts.get.concat(rpo.optionConflictChildren.get) as LoadedOption[],
  ).intersection(configSoFarSet);
  // Establish a new config, but with our conflicts removed
  const altConfig = configSoFarSet.difference(conflictingOptions);
  for (const p of missingPrereqs) altConfig.add(p);
  altConfig.add(rpo);
  // Use `fillInDefaults` as normal, but also add `conflictingGroups` so we re-add any groups we
  // just removed (fillInDefaults is smart enough to only do this for required/included groups)
  const conflictingGroups = new Set(conflictingOptions.values().map((rpo) => rpo.optionGroup.get as LightGroup));
  fillInDefaults(altConfig, [...conflictingGroups, ...remainingGroups]);
  return [...altConfig];
}

const scopeBinding = jb.array(tlivPojo);
const scopeCache = DataCache.create(
  // Only store 30 of these since it's the scope for an entire POF, which could be considerable
  // Cache key: (pof.id, rpav.id, key)
  // - key = rpav.updatedAt for drafts (fresh when RPAV changes via reactions)
  // - key = "published" for published RPAVs (static, valid forever)
  { name: "scope", binding: scopeBinding, version: "5", maxEntries: 30, additionalKeyFn: rpavAdditionalKey },
  async (pof: ProductOffering, rpav: ReadyPlanAggregateVersion) => {
    const { em } = pof;
    const [tli, tliv] = aliases(TakeoffLineItem, TakeoffLineItemVersion);
    const tlivs = await em.find(
      TakeoffLineItemVersion,
      { as: tliv, identity: tli },
      {
        conditions: versionConditions(rpav, tli, tliv),
        populate: {
          identity: {},
          item: "costCode",
          options: { optionGroup: { group: "type" }, name: {} },
          // We need to populate `materialVariant.listing.optionPricingConfig` for all materials...
          materialVariant: { listing: ["preCutoffDesiredMarginInBasisPoints", "activeOptionPricingConfig"] },
          unitOfMeasure: {},
        },
      },
    );
    return tlivs.map((tliv) => {
      const { id, identity, quantity, materialVariant: mv, unitOfMeasure, options } = withLoaded(tliv);
      const { leveledUnitCostInCents } = identity;
      const materialVariant: TlivPojo["materialVariant"] = mv
        ? {
            id: mv.id,
            preCutoffDesiredMarginInBasisPoints: mv.listing.get.preCutoffDesiredMarginInBasisPoints.get,
            selectionFeeInCents: mv.listing.get.activeOptionPricingConfig.get?.selectionFeeInCents ?? 0,
          }
        : undefined;
      return {
        id,
        identityId: identity.id,
        locationId: tliv.location.id,
        slotId: tliv.slot.id,
        leveledUnitCostInCents,
        totalCostInCents: leveledUnitCostInCents ? leveledUnitCostInCents * (quantity ?? 1) : tliv.totalCostInCents,
        quantity,
        marginInBasisPoints: getMarginFromMaterialCatalog({ materialVariant } as any),
        materialVariant,
        isPersonalization: options.some((rpo) => isDefined(rpo.optionGroup.get.personalizationType)),
        shouldMultiplySelectionFee: unitOfMeasure.shouldMultiplySelectionFee ?? false,
        optionsSet: new Set(idsOf(options)),
        options: options.map((rpo) => ({ id: rpo.id, name: rpo.name.get, groupId: rpo.optionGroup.id })),
        optionsByGroup: options
          .groupByObject((rpo) => rpo.optionGroup.get)
          .sortBy(([rpog]) => [rpog.order])
          .map(([rpog, rpos]) => [rpog.id, new Set(idsOf(rpos))] as const),
        isAddOnV2: options.some((rpo) => rpo.optionGroup.get.group.get.type.get.isAddOnV2 === true),
        personalizationSlotOrder: identity.personalizationSlotOrder,
        costCode: tliv.item.get.costCode.get.displayName,
      } satisfies TlivPojo;
    });
  },
);

// Just exporting the cache directly generates a type error, using a helper does not for some reason.  It also allows us
// to populate our ccfg to get the pof/rpav in a single promise for callers.
export async function getScopeCache(pof: ProductOffering): Promise<jb.Infer<typeof scopeBinding>>;
export async function getScopeCache(ccfg: CheckoutConfig): Promise<jb.Infer<typeof scopeBinding>>;
export async function getScopeCache(
  ccfgOrPof: CheckoutConfig | ProductOffering,
): Promise<jb.Infer<typeof scopeBinding>> {
  let ccfg: CheckoutConfig | undefined;
  let pof: ProductOffering;
  if (ccfgOrPof instanceof CheckoutConfig) {
    ccfg = ccfgOrPof;
    pof = (await ccfg.productOffering.load())!;
  } else {
    pof = ccfgOrPof;
  }
  const rpav = await (hasAggregateVersionData(pof)
    ? getPinnedAggregateVersion(pof)
    : pof.em.load(
        ReadyPlanAggregateVersion,
        ccfg?.aggregateVersion.idIfSet ??
          pof.aggregateCheckout.idIfSet ??
          pof.aggregateActive.idIfSet ??
          pof.aggregateDraft.id,
      ));
  return scopeCache.get(pof.em.ctx, pof, rpav);
}

export const pricingScopeCache = DataCache.create(
  // This cache stores megabytes of data per entry, and we should generally never have more than a handful per active POF.
  // So we can have a low cap on the number stored in memory.
  // Cache key: (pof.id, rpav.id, key)
  // - Depends on scopeCache, so inherits same freshness guarantee
  // - key = rpav.updatedAt for drafts, "published" for published
  {
    name: "pricingScope",
    binding: pricingScopeBinding,
    maxEntries: 30,
    version: "4",
    additionalKeyFn: rpavAdditionalKey,
  },
  async (pof: ProductOffering, rpav: ReadyPlanAggregateVersion) => {
    const tlivPojos: TlivPojo[] = await scopeCache.get(pof.em.ctx, pof, rpav);
    const [baseHouseScope, optionalScope] = tlivPojos.partition((tliv) => tliv.options.isEmpty);
    return {
      ...calcBaseHouseCostAndPrice(baseHouseScope),
      // I.e. if `options=[elevation1, specLevel1, specLevel2]` index by `[specLevel1, specLevel2]`
      scopeByLastOptions: indexBy(optionalScope, (tliv) => {
        // Within our last group, i.e. SpecLevel or AddBedroom, one of the RPOs in that group must be the "last AND"
        // in our (potentially) stacks options array, so for price/cost attribution purposes, all RPOs in that RPOG
        // will own/enable the cost/price of this TLIV (only 1 can be turned on at a time).
        const lastGroup = tliv.optionsByGroup.last!;
        const [, rpoIds] = lastGroup;
        return Array.from(rpoIds);
      }),
    } satisfies PricingData;
  },
);

const activeScopeBinding = jb.object({
  // TLIVs for any slot with a negative quantity.
  tlivs: jb.array(tlivPojo),
  // RPOGs with all type=scope location ids
  rpogs: jb.array(jb.object({ id: jb.id(() => ReadyPlanOptionGroup), locationIds: jb.set(jb.id(() => Location)) })),
});

const activeScopeCache = DataCache.create(
  // Cache key: (pof.id, rpav.id, key)
  // - Caches backed-out TLIVs (negative quantity) and scope RPOGs
  // - key = rpav.updatedAt for drafts (fresh on TLIV/RPOG changes), "published" for stable data
  { name: "backedOutScope", binding: activeScopeBinding, version: "4", additionalKeyFn: rpavAdditionalKey },
  async (pof: ProductOffering, rpav: ReadyPlanAggregateVersion) => {
    const { ctx } = pof.em;
    const { knex } = ctx;
    const [rpogv, rpog, rpov, rpo, tliv, tli] = aliases(
      ReadyPlanOptionGroupVersion,
      ReadyPlanOptionGroup,
      ReadyPlanOptionVersion,
      ReadyPlanOption,
      TakeoffLineItemVersion,
      TakeoffLineItem,
    );
    function conditions(identity: any, version: any): (ExpressionCondition | undefined)[] {
      const conditions = versionConditions(rpav, identity, version).and!;
      // we don't need to re-check if the ready plan id is correct
      conditions.shift();
      // but we do need to check for the version entity's presence since joist will create outer joins going across a
      // m2m or o2m relation
      conditions.push(version.id.ne(null));
      return conditions;
    }
    const rpogQuery = buildQuery(knex, ReadyPlanOptionGroup, {
      where: { as: rpog, versions: rpogv, options: { as: rpo, versions: rpov, itemTemplateItems: tliv } },
      conditions: {
        and: [
          rpog.readyPlan.eq(rpav.readyPlan.id),
          rpog.personalizationType.ne(null),
          ...conditions(rpog, rpogv),
          ...conditions(rpo, rpov),
          ...conditions(tli, tliv),
          tliv.materialVariant.ne(null),
        ],
      },
    })
      .clear("select")
      .select(knex.raw("rpog.id::text as id"))
      .select(knex.raw("array_agg(iti.location_id::text) as location_ids"))
      .groupBy("rpog.id") as Knex.QueryBuilder<any, { id: string; location_ids: string[] }[]>;

    const [tlivPojos, rpogRows] = await Promise.all([scopeCache.get(ctx, pof, rpav), rpogQuery]);
    const tlivsBySlot = tlivPojos.groupBy((tliv) => tliv.slotId);
    const tlivs = tlivPojos.filter((tliv) =>
      tlivsBySlot[tliv.slotId].some((tliv) => (tliv.quantity ?? 0) < 0 && tliv.isAddOnV2),
    );
    const rpogs = rpogRows.map(({ id, location_ids }) => ({
      id: tagId(ReadyPlanOptionGroup, id),
      locationIds: new Set(tagIds(Location, location_ids) as IdOf<Location>[]),
    }));
    return { tlivs, rpogs };
  },
);

/** Personalization option groups that have slots that are active */
type ActiveScope = {
  /** Some base-house personalization RPOGs are disabled when Addons swap their materials out. */
  activePersonalizationOptionGroupIds: Set<ReadyPlanOptionGroupId>;
  /** Some base-house locations are disabled when Addons swap their materials out. */
  disabledBaseHouseLocationIds: Set<LocationId>;
};
/**
 * Returns the set of personalization option groups that have slots that are active.
 *
 * This is used to determine which personalization option groups are eligible for slots.
 */
export async function computeActiveScope(
  pof: ProductOffering,
  rpav: ReadyPlanAggregateVersion,
  ccfgOptions: ReadyPlanOption[],
): Promise<ActiveScope> {
  const { ctx } = pof.em;
  const { tlivs, rpogs } = await activeScopeCache.get(ctx, pof, rpav);
  // Get the slots which are backed out by the ccfg options
  const set = new Set(idsOf(ccfgOptions));
  // If no tlivs match, we still want to know that the location was empty, so prepopulate the map with zeroes for every
  // location.  Then tlivs that do match will override.
  const map = new Map<LocationId, number>(tlivs.map((tliv) => [tliv.locationId, 0]));
  tlivs
    .values()
    .filter((tliv) => isMatchingTliv(tliv, set))
    .forEach((tliv) => {
      const { locationId, quantity = 0 } = tliv;
      map.set(locationId, (map.get(locationId) ?? 0) + quantity);
    });
  const backedOutLocationIds = new Set(
    map
      .entries()
      .filter(([, quantity]) => quantity <= 0)
      .map(([id]) => id),
  );
  const activePersonalizationOptionGroupIds = new Set(
    rpogs
      .values()
      .filter(({ locationIds }) => locationIds.difference(backedOutLocationIds).size > 0)
      .map(({ id }) => id),
  );
  return { activePersonalizationOptionGroupIds, disabledBaseHouseLocationIds: backedOutLocationIds };
}

type OptionSelectionFeeData = Map<
  ReadyPlanOptionId,
  {
    materialVariantId: MaterialVariantId;
    quantity: number;
    slotId: ItemSlotId;
    selectionFeeInCents: number;
    totalSelectionFeeInCents: number;
  }[]
>;

/**
 * Returns the material selection fees for the user selected personalization options.
 *
 * This is a cached value b/c the `shouldMultiplySelectionFee` logic means we have to group all enabled scope
 * by slot id, calc the per-slot quantity, and then do the multiplication accordingly.
 */
export async function computeOptionSelectionFees(
  pof: Loaded<ProductOffering, { optionGroups: "options" }>,
  rpav: ReadyPlanAggregateVersion,
  ccfgOptions: ReadyPlanOption[], // All selected options
  includedOptions: ReadyPlanOption[], // All included options
): Promise<OptionSelectionFeeData> {
  const tlivPojos = await scopeCache.get(pof.em.ctx, pof, rpav);
  const tlivsBySlot = tlivPojos.groupByObject((tliv) => tliv.slotId);
  const includedOptionSet = new Set(includedOptions);
  // Get the personalization options that are not included so we can consider them for selection fee purposes
  const notIncludedPersonalizationOptions = new Set(
    pof.optionGroups.get
      .values()
      .filter((rpog) => rpog.personalizationType)
      .flatMap((rpog) => rpog.options.get)
      .filter((rpo) => !includedOptionSet.has(rpo))
      .map((rpo) => rpo.id),
  );

  const allRpoIds = new Set(ccfgOptions.map((rpo) => rpo.id));
  const rpoIdByGroup = new Map<ReadyPlanOptionGroupId, ReadyPlanOptionId>(
    ccfgOptions.map((rpo) => [rpo.optionGroup.id, rpo.id]),
  );

  // Collect the material selection fee data for the user selected personalization options
  return new Map(
    tlivsBySlot
      .values()
      .filter(([, tlivs]) => tlivs.some((tliv) => (tliv.materialVariant?.selectionFeeInCents ?? 0) !== 0))
      .filter(([, tlivs]) =>
        tlivs.some((tliv) => tliv.options.some((rpo) => notIncludedPersonalizationOptions.has(rpo.id))),
      )
      .flatMap(([slotId, tlivsForSlot]) => {
        return tlivsForSlot
          .values()
          .filter((tliv) => tliv.isPersonalization)
          .flatMap((tliv) => tliv.options.values())
          .filter((rpo) => notIncludedPersonalizationOptions.has(rpo.id))
          .map((notIncludedRpo) => {
            // remove the current option for this group, add the candidate
            const idToRemove = rpoIdByGroup.get(notIncludedRpo.groupId);
            if (idToRemove) allRpoIds.delete(idToRemove);
            allRpoIds.add(notIncludedRpo.id);

            const matchingTlivs = tlivsForSlot.filter((tliv) => isMatchingTliv(tliv, allRpoIds));

            // Restore the shared set to its original state
            allRpoIds.delete(notIncludedRpo.id);
            if (idToRemove) allRpoIds.add(idToRemove);

            const quantity = matchingTlivs.sum((tliv) => tliv.quantity);
            if (quantity === 0) return; // ignore the slot if it has been backed out - maybe include for tracing?
            const tliv = matchingTlivs.find((tliv) => isDefined(tliv.materialVariant));
            if (!tliv) return; // this should never happen
            const { shouldMultiplySelectionFee, materialVariant } = tliv;
            const { id: materialVariantId, selectionFeeInCents } = materialVariant!;
            const totalSelectionFeeInCents = (shouldMultiplySelectionFee ? quantity : 1) * selectionFeeInCents;
            return {
              slotId,
              quantity,
              option: notIncludedRpo.id,
              materialVariantId,
              selectionFeeInCents,
              totalSelectionFeeInCents,
            };
          });
      })
      .filter(isDefined)
      .toArray()
      .groupByObject(
        (v) => v.option,
        ({ option, ...details }) => details,
      ),
  );
}

export function addMarginWithRounding(logger: Logger, totalCostInCents: number, marginInBasisPoints: number) {
  const priceWithMargin = addMargin(totalCostInCents, marginInBasisPoints);
  // Only allow 0.5% margin reduction (0.5% = 50 basis points)
  // I.e. for 40% margin (4000 basis points), lowest allowed margin is 39.5% (3950 basis points)
  const lowestAllowedPrice = addMargin(totalCostInCents, marginInBasisPoints - 50);
  /**
   * We want to make sure that the margin after rounding is at least 0.5% less than the desired margin
   * so that we don't have a situation where the price is rounded down and the margin is too low.
   * Example: A cost of $850 w/40% margin is $1190 price; but if we round down to $1150,
   * that is a 35.3% margin, so adjust up to $1200.
   */
  const down = roundToPriceIncrement(priceWithMargin);
  // Look at the absolute values to avoid issues with negative costs/prices.
  // This ensures that negative scope is correctly backed out of both cost and price, including any rounding.
  if (Math.abs(down) < Math.abs(lowestAllowedPrice)) {
    const up = roundToPriceIncrement(priceWithMargin, true);
    traceRounding &&
      logger.debug(`      rounded ${formatCentsAsDollars(priceWithMargin)} to ${formatCentsAsDollars(up)}`);
    return up;
  } else {
    traceRounding &&
      logger.debug(`      rounded ${formatCentsAsDollars(priceWithMargin)} to ${formatCentsAsDollars(down)}`);
    return down;
  }
}

/**
 * Rounds to the nearest increment according to Homebound's pricing rules.
 *
 * - $100 will be rounded to the nearest $5
 * - $500 will be rounded to the nearest $10
 * - $1000 will be rounded to the nearest $50
 * - $5000 will be rounded to the nearest $100
 *
 * NOTE: To ensure that negative scope is correctly backed out of both cost and price, including any rounding,
 * we take the absolute value of the price in cents before rounding. That way -560 and + 560 will both round to -/+600.
 */
function roundToPriceIncrement(priceInCents: number, roundUp: boolean = false): number {
  const absolutePriceInDollars = Math.abs(priceInCents) / 100;
  const increment = getIncrement(absolutePriceInDollars);
  const roundFunction = roundUp ? Math.ceil : Math.round;
  return roundFunction(absolutePriceInDollars / increment) * increment * 100 * Math.sign(priceInCents);
}

function getIncrement(priceInDollars: number): number {
  if (priceInDollars <= 100) {
    return 5;
  } else if (priceInDollars <= 500) {
    return 10;
  } else if (priceInDollars <= 1000) {
    return 50;
  } else if (priceInDollars <= 5000) {
    return 100;
  } else {
    // For prices > $5000, round to nearest $100
    return 100;
  }
}

// For debugging
const formatRpo = (rpo: any) => (!rpo ? `na` : `${rpo.id} ${rpo.code.get}`);

/** This diffs the full/including-stacked scope of `included vs. selected` to highlight only the differences. */
export function calcIncludedOnlyTlivIds(
  scope: PricingData,
  includedConfig: ReadyPlanOption[],
  selectedConfig: ReadyPlanOption[],
): { selectedOnlyTlivIds: string[]; includedOnlyTlivIds: string[] } {
  // Get the full list of tliv POJOs for each included/selected
  const includedRpoIds = new Set(idsOf(includedConfig));
  const included = includedConfig
    .flatMap((rpo) => scope.scopeByLastOptions.get(rpo.id) ?? [])
    .filter((t) => isMatchingTliv(t, includedRpoIds))
    .map((t) => t.id);

  const selectedRpoIds = new Set(idsOf(selectedConfig));
  const selected = selectedConfig
    .flatMap((rpo) => scope.scopeByLastOptions.get(rpo.id) ?? [])
    .filter((t) => isMatchingTliv(t, selectedRpoIds))
    .map((t) => t.id);

  // Then just diff the two
  return {
    includedOnlyTlivIds: [...included.difference(selected)],
    selectedOnlyTlivIds: [...selected.difference(included)],
  };
}

/** A friendly, exported version of `fillInDefaults` that handles our internal loading. */
export async function fixStaleConfig(
  pof: ProductOffering,
  options: readonly ReadyPlanOption[],
  includedByMap?: LightOptionMap,
): Promise<LoadedOption[]> {
  const [{ optionGroups: lightRpogs }, loadedOptions] = await Promise.all([
    // Lighter hint to skip loading pricing-only fields (margins, name, optionLevels)
    withLoaded(pof.populate({ optionGroups: fixStaleRpogHint })),
    pof.em.populate(options, {
      ...rpoHint,
      // In theory, we shouldn't need this extra `groupPrerequisites: {}`, b/c we ask for the `optionGroups: rpogHint`
      // to be loaded, but a `(rpo.optionGroup.get.groupPrerequisites.get)` failed with "not loaded" in production.
      // We seem to have a race condition where plan-configuration-frontend is sending in "the wrong options", that
      // are not necessarily for the current POF.
      optionGroup: { ...rpoHint["optionGroup"], groupPrerequisites: {} },
    }),
  ]);
  const rpogs = lightRpogs;
  // First remove any options that are missing prereqs, i.e. b/c of plan  changes (in a loop to handle transitive prereqs)
  let changed = true;
  let result = loadedOptions;
  do {
    const count = result.length;
    const selected: Set<ReadyPlanOption> = new Set(result);
    const selectedGroups: Set<ReadyPlanOptionGroup> = new Set(result.map((rpo) => rpo.optionGroup.get));
    result = result.filter((rpo) => {
      // Make sure both options & groups prereqs are met
      const optionsMet = rpo.optionPrerequisites.get
        .groupByObject((prereq) => prereq.optionGroup.id)
        .every(([_, prereqsInGroup]) => {
          return prereqsInGroup.some((prereq) => selected.has(prereq));
        });
      const groupsMet = rpo.optionGroup.get.groupPrerequisites.get.every((prereq) => selectedGroups.has(prereq));
      // if (!optionsMet) console.log(`Removing prereq-unmet option ${rpo} ${rpo.displayName.get}`);
      // if (!groupsMet) console.log(`Removing prereq-unmet option ${rpo} ${rpo.displayName.get}`);
      return optionsMet && groupsMet;
    });
    changed = count !== result.length;
  } while (changed);
  // Then fill in missing options...
  const filledResult = fillInMissingOptionsImpl(
    rpogs,
    // It's very easy for POC base configs & Structure configs to become stale, i.e. both:
    // - missing newly-added personalization options (that we'll add during fillInMissingOptionsImpl), and
    // - using stale/archived personalization options that have been removed/reorganized.
    //
    // We could/should potentially show the user these changes, sometimes--things like "we don't offer the
    // garage upgrade anymore" is important, but things like "A&D rejiggered personalization options since the
    // initial UW config for this Structure was created" are not. Given this ambiguity, and the fact that any
    // options we're removing here are only "for the CheckoutConfig" and will be staged via ChangeEvent means
    // its probably fine to just drop these, to unblock the user actually using checkout.
    result.filter((rpo) => rpo.active),
    includedByMap,
  );
  // Fully populate the final set of options so callers get LoadedOption[]
  return pof.em.populate(filledResult, rpoHint);
}

export function fillInMissingOptionsImpl(
  rpogs: LightGroup[], // all rpogs for the POF
  options: LightOption[],
  includedByMap?: LightOptionMap,
): LightOption[] {
  const selectedRpogs = new Set(options.map((rpo) => rpo.optionGroup.get));
  // `fillInDefaults` will check the RPOGs for "should be filled in"-ness (i.e. required/included/prereq)
  const emptyRpogs = rpogs.filter((rpog) => rpog.active && !selectedRpogs.has(rpog));
  const configSoFar = new Set(options);
  // Let `fillInDefaults` walk through the rpogs and fill out `configSoFar` with the correct options
  const configSoFarMap = fillInDefaults(configSoFar, emptyRpogs, includedByMap);

  // `fillInDefaults` only processes empty RPOGs, so options that were already selected (e.g. from a base
  // config or explicitly passed in) won't have includedBy entries. Re-check those against RPRO/HRO/default
  // rules so that their includedByCheckoutConfigOption FK gets set correctly.
  // We look up the rpog from the fully-loaded `rpogs` array (rather than `rpo.optionGroup.get`) because the
  // input options may come from a different POF (e.g. when switching plans) and won't have `options` loaded.
  if (includedByMap) {
    const codes = new Set(configSoFar.values().map((rpo) => rpo.code.get));
    const hros = rpogs.nonEmpty ? getHardcodedRequiredOptions(rpogs[0].readyPlan.get) : [];

    for (const rpo of options) {
      const rpoId = rpo.idMaybe;
      if (!rpoId || includedByMap.has(rpoId)) continue;
      const rpog = rpogs.find((g) => g === rpo.optionGroup.get);
      if (!rpog) continue;
      const directEnabler = findDirectEnabler(
        rpo,
        maybeHardcodedRequiredAddons(configSoFarMap, rpog, codes, hros),
        maybeMatchingRequiredOptions(configSoFarMap, rpog),
        matchingDefaults(configSoFarMap, rpog),
      );
      if (directEnabler) {
        includedByMap.set(rpoId, directEnabler);
      }
    }
  }

  return configSoFar.values().toArray();
}

function emptyPricing(): CheckoutPofPricing {
  return {
    baseCostInCents: 0,
    basePriceInCents: 0,
    totalPriceInCents: 0,
    totalCostInCents: 0,
    salesPriceInCents: 0,
    optionDetails: new Map(),
    optionCutoffs: new Map(),
    rpogsWithSlots: new Set(),
    mhTotalPriceInCents: 0,
    aduTotalPriceInCents: 0,
    mhSalesPriceInCents: 0,
    aduSalesPriceInCents: 0,
  };
}

/** Merges MH and ADU CheckoutPricing results */
function mergeCheckoutPricing(mh: CheckoutPricing, adu: CheckoutPricing): CheckoutPofPricing {
  return {
    baseCostInCents: mh.baseCostInCents + adu.baseCostInCents,
    basePriceInCents: mh.basePriceInCents + adu.basePriceInCents,
    totalCostInCents: mh.totalCostInCents + adu.totalCostInCents,
    totalPriceInCents: mh.totalPriceInCents + adu.totalPriceInCents,
    salesPriceInCents: mh.salesPriceInCents + adu.salesPriceInCents,
    optionDetails: new Map([mh, adu].values().flatMap((p) => p.optionDetails.entries())),
    optionCutoffs: new Map([mh, adu].values().flatMap((p) => p.optionCutoffs.entries())),
    rpogsWithSlots: mh.rpogsWithSlots.union(adu.rpogsWithSlots),
    mhTotalPriceInCents: mh.totalPriceInCents,
    aduTotalPriceInCents: adu.totalPriceInCents,
    mhSalesPriceInCents: mh.salesPriceInCents,
    aduSalesPriceInCents: adu.salesPriceInCents,
  };
}

function costAndPrice(costInCents: number, priceInCents: number): CostAndPrice {
  return { costInCents, priceInCents };
}

function addCostAndPrice(a: CostAndPrice, b: CostAndPrice | undefined): CostAndPrice {
  if (!b) return a;
  return { costInCents: a.costInCents + b.costInCents, priceInCents: a.priceInCents + b.priceInCents };
}

function subCostAndPrice(a: CostAndPrice, b: CostAndPrice | undefined): CostAndPrice {
  if (!b) return a;
  return { costInCents: a.costInCents - b.costInCents, priceInCents: a.priceInCents - b.priceInCents };
}

export function isMatchingTliv(tliv: TlivPojo, options: Set<ReadyPlanOptionId>) {
  // This filter is basically doing the work of `TlivScope.getMatchingTlivs`, but without the additional overhead
  // required to set up a TlivScope.  Since we're using a POJO for the tlivs, we couldn't use TlivScope anyway.
  return tliv.optionsByGroup.every(([, rpos]) => !rpos.isDisjointFrom(options));
}

/**
 * Builds a set of RPO IDs that influence downstream default selection.
 *
 * An RPO "influences downstream" if it appears in any other RPO's optionDefaultsIf,
 * personalizationTargetCombinations, optionRequiredIf.targetCombinations, or is
 * referenced by a HardcodedRequiredOption trigger. When an RPO is in this set,
 * swapping it in `configSoFar` could change which defaults fillInDefaults picks,
 * so it cannot use the fast path.
 */
function buildDownstreamInfluenceIndex(rpogs: LoadedGroup[], hros: HardcodedRequiredOption[]): Set<ReadyPlanOptionId> {
  const influenced = new Set<ReadyPlanOptionId>();
  for (const rpog of rpogs) {
    for (const rpo of rpog.options.get) {
      // I.e. rpo defaults when `def` is in configSoFar
      for (const def of rpo.optionDefaultsIf.get) influenced.add(def.id);
      // I.e. rpo defaults when all IDs in a combo are in configSoFar
      for (const combo of rpo.personalizationTargetCombinations) {
        for (const id of combo) influenced.add(id);
      }
      // I.e. rpo is required when all IDs in a combo are in configSoFar
      for (const rpro of rpo.optionRequiredIf.get) {
        for (const combo of rpro.targetCombinations) {
          for (const id of combo) influenced.add(id);
        }
      }
    }
  }
  // HROs trigger based on RPO codes; collect all RPO IDs whose codes could trigger any HRO
  if (hros.nonEmpty) {
    for (const rpog of rpogs) {
      for (const rpo of rpog.options.get) {
        if (hros.some((hro) => hro.triggeredBy(new Set([rpo.code.get])))) {
          influenced.add(rpo.id);
        }
      }
    }
  }
  return influenced;
}

/**
 * Builds a map of RPOG -> set of RPOGs it "dirties" when its selection changes.
 *
 * A TLIV with `optionsByGroup = [[rpogA, {rpoA}], [rpogB, {rpoB}], [rpogC, {rpoC}]]`
 * means rpogC is the "owning" group (last), and rpogA/rpogB are upstream dependencies.
 * Changing the selection in rpogA or rpogB could change which TLIVs match for rpogC,
 * so we record `rpogA -> dirties rpogC` and `rpogB -> dirties rpogC`.
 */
function buildGroupDirtiesIndex(scope: PricingData): Map<ReadyPlanOptionGroupId, Set<ReadyPlanOptionGroupId>> {
  const dirties = new Map<ReadyPlanOptionGroupId, Set<ReadyPlanOptionGroupId>>();
  // We'll see duplicate TLIVs across scopeByLastOptions entries, but deduplication isn't
  // needed since adding the same dependency twice to a Set is a no-op.
  for (const tlivs of scope.scopeByLastOptions.values()) {
    for (const tliv of tlivs) {
      if (tliv.optionsByGroup.length < 2) continue;
      // The last group is the "owner" -- upstream groups dirty it
      const lastGroupId = tliv.optionsByGroup[tliv.optionsByGroup.length - 1][0];
      for (let i = 0; i < tliv.optionsByGroup.length - 1; i++) {
        const upstreamGroupId = tliv.optionsByGroup[i][0];
        let set = dirties.get(upstreamGroupId);
        if (!set) {
          set = new Set();
          dirties.set(upstreamGroupId, set);
        }
        set.add(lastGroupId);
      }
    }
  }
  return dirties;
}

/**
 * Given a set of directly-changed RPOGs, expand to include all transitively-dirtied downstream groups.
 * Only includes groups that are in `candidateGroups` (i.e. remaining groups that haven't been locked in yet).
 */
function expandDirtiedGroups(
  groupDirties: Map<ReadyPlanOptionGroupId, Set<ReadyPlanOptionGroupId>>,
  changed: Set<ReadyPlanOptionGroupId>,
): Set<ReadyPlanOptionGroupId> {
  const result = new Set(changed);
  const queue = [...changed];
  while (queue.length > 0) {
    const groupId = queue.pop()!;
    const downstream = groupDirties.get(groupId);
    if (!downstream) continue;
    for (const dirtied of downstream) {
      if (!result.has(dirtied)) {
        result.add(dirtied);
        queue.push(dirtied);
      }
    }
  }
  return result;
}
