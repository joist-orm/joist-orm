#!/usr/bin/env bash
set -euo pipefail

artifact_dir=""
monitor_pid=""
process_file=""
report_name=""
report_slug=""
sample_interval=""
samples_file=""
start_time=""
summary_file=""
command=()

function main() {
  local command_status

  if [[ $# -lt 3 || "$2" != "--" ]]; then
    printf "Usage: %s <report-name> -- <command...>\n" "$0" >&2
    exit 2
  fi

  report_name="$1"
  report_slug="${report_name//[^A-Za-z0-9_.-]/_}"
  if [[ -z "$report_slug" ]]; then
    report_slug="cpu-report"
  fi
  shift 2
  command=("$@")

  artifact_dir="${CI_CPU_REPORT_DIR:-artifacts}"
  sample_interval="${CI_CPU_SAMPLE_INTERVAL:-2}"
  samples_file="$artifact_dir/cpu-$report_slug.tsv"
  summary_file="$artifact_dir/cpu-$report_slug-summary.txt"
  process_file="$artifact_dir/cpu-$report_slug-processes.txt"

  mkdir -p "$artifact_dir"
  start_time="$(date +%s)"

  printf "elapsed_seconds\tcpu_percent\tload_1m\tload_5m\tload_15m\tmem_used_percent\n" > "$samples_file"

  sample_cpu_usage &
  monitor_pid="$!"

  set +e
  "${command[@]}"
  command_status="$?"
  set -e

  stop_monitor
  write_process_snapshot
  write_summary "$command_status"
  print_summary

  exit "$command_status"
}

function sample_cpu_usage() {
  local cpu_percent idle idle_delta load_1 load_5 load_15 now previous_idle previous_total total total_delta

  read -r previous_total previous_idle < <(read_cpu_totals)
  while true; do
    sleep "$sample_interval"
    read -r total idle < <(read_cpu_totals)
    total_delta=$((total - previous_total))
    idle_delta=$((idle - previous_idle))
    if ((total_delta > 0)); then
      cpu_percent=$(((100 * (total_delta - idle_delta)) / total_delta))
    else
      cpu_percent=0
    fi
    read -r load_1 load_5 load_15 _ < /proc/loadavg
    now="$(date +%s)"
    printf "%s\t%s\t%s\t%s\t%s\t%s\n" \
      "$((now - start_time))" \
      "$cpu_percent" \
      "$load_1" \
      "$load_5" \
      "$load_15" \
      "$(read_mem_used_percent)" >> "$samples_file"
    previous_total="$total"
    previous_idle="$idle"
  done
}

function read_cpu_totals() {
  local cpu guest guest_nice idle iowait irq nice softirq steal system user

  read -r cpu user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
  printf "%s %s\n" "$((user + nice + system + idle + iowait + irq + softirq + steal))" "$((idle + iowait))"
}

function read_mem_used_percent() {
  local available key total unused value

  available=0
  total=0
  while read -r key value unused; do
    case "$key" in
      MemAvailable:)
        available="$value"
        ;;
      MemTotal:)
        total="$value"
        ;;
    esac
    if ((available > 0 && total > 0)); then
      break
    fi
  done < /proc/meminfo

  if ((total == 0)); then
    printf "0\n"
  else
    printf "%s\n" "$(((100 * (total - available)) / total))"
  fi
}

function stop_monitor() {
  if [[ -n "$monitor_pid" ]]; then
    kill "$monitor_pid" 2>/dev/null || true
    wait "$monitor_pid" 2>/dev/null || true
    monitor_pid=""
  fi
}

function write_process_snapshot() {
  {
    printf "Top processes by CPU at report end\n\n"
    ps -eo pid,ppid,pcpu,pmem,comm,args --sort=-pcpu 2>/dev/null | awk 'NR <= 26 { print }'
  } > "$process_file" || true
}

function write_summary() {
  local arg command_status cpu_count duration end_time

  command_status="$1"
  end_time="$(date +%s)"
  duration="$((end_time - start_time))"
  cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || true)"
  if [[ -z "$cpu_count" ]]; then
    cpu_count="$(nproc 2>/dev/null || true)"
  fi
  if [[ -z "$cpu_count" ]]; then
    cpu_count="unknown"
  fi

  {
    printf "Report name: %s\n" "$report_name"
    printf "Command:"
    for arg in "${command[@]}"; do
      printf " %q" "$arg"
    done
    printf "\n"
    printf "Exit status: %s\n" "$command_status"
    printf "Duration: %ss\n" "$duration"
    printf "CPU count: %s\n" "$cpu_count"
    printf "Sample interval: %ss\n" "$sample_interval"
    printf "Samples: %s\n" "$samples_file"
    printf "Process snapshot: %s\n" "$process_file"
  } > "$summary_file"

  awk -v cpu_count="$cpu_count" '
    NR > 1 {
      samples++
      cpu = $2 + 0
      load1 = $3 + 0
      load5 = $4 + 0
      mem = $6 + 0
      cpu_sum += cpu
      load1_sum += load1
      load5_sum += load5
      mem_sum += mem
      if (cpu > cpu_max) cpu_max = cpu
      if (load1 > load1_max) load1_max = load1
      if (load5 > load5_max) load5_max = load5
      if (mem > mem_max) mem_max = mem
    }
    END {
      if (samples == 0) {
        print "Collected samples: 0"
        exit
      }
      printf "Collected samples: %d\n", samples
      printf "Average CPU busy: %.1f%%\n", cpu_sum / samples
      printf "Peak CPU busy: %.1f%%\n", cpu_max
      printf "Average 1m load: %.2f\n", load1_sum / samples
      printf "Peak 1m load: %.2f\n", load1_max
      printf "Average 5m load: %.2f\n", load5_sum / samples
      printf "Peak 5m load: %.2f\n", load5_max
      printf "Average memory used: %.1f%%\n", mem_sum / samples
      printf "Peak memory used: %.1f%%\n", mem_max
      if (cpu_count ~ /^[0-9]+$/ && cpu_count > 0) {
        printf "Peak 1m load / CPU: %.2f\n", load1_max / cpu_count
      }
    }
  ' "$samples_file" >> "$summary_file"
}

function print_summary() {
  local line

  printf "\nCPU usage report\n"
  while IFS= read -r line; do
    printf "%s\n" "$line"
  done < "$summary_file"
}

main "$@"
