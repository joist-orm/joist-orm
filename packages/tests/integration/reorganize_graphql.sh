#!/bin/bash

# GraphQL Schema File Reorganizer
# This script reorganizes resolver files based on schema files found in schema/ directory

set -e  # Exit on any error

SCHEMA_DIR="schema"
SRC_DIR="src/resolvers"

# Check if schema directory exists
if [ ! -d "$SCHEMA_DIR" ]; then
    echo "Error: $SCHEMA_DIR directory not found"
    exit 1
fi

# Check if src/resolvers directory exists
if [ ! -d "$SRC_DIR" ]; then
    echo "Error: $SRC_DIR directory not found"
    exit 1
fi

echo "Starting GraphQL file reorganization..."

# Build complete import mapping for all entities first
declare -A import_map

echo "Building import mapping for all entities..."
for schema_file in "$SCHEMA_DIR"/*.graphql; do
    # Skip if no .graphql files found
    [ ! -f "$schema_file" ] && continue

    # Extract the base name without extension (e.g., "author" from "author.graphql")
    entity_name=$(basename "$schema_file" .graphql)

    echo "  Scanning entity: $entity_name"

    # Build import mapping for queries
    queries_dir="$SRC_DIR/queries/$entity_name"
    if [ -d "$queries_dir" ]; then
        for file in "$queries_dir"/*; do
            [ ! -f "$file" ] && continue
            filename=$(basename "$file")
            if [[ "$filename" == *.ts ]]; then
                base_name_old="${filename%.ts}"
                new_filename="${filename/Resolver/Query}"
                base_name_new="${new_filename%.ts}"
                old_import_path="src/resolvers/queries/$entity_name/$base_name_old"
                new_import_path="src/resolvers/$entity_name/$base_name_new"
                import_map["$old_import_path"]="$new_import_path"
            fi
        done
    fi

    # Build import mapping for mutations
    mutations_dir="$SRC_DIR/mutations/$entity_name"
    if [ -d "$mutations_dir" ]; then
        for file in "$mutations_dir"/*; do
            [ ! -f "$file" ] && continue
            filename=$(basename "$file")
            if [[ "$filename" == *.ts ]]; then
                base_name_old="${filename%.ts}"
                new_filename="${filename/Resolver/Mutation}"
                base_name_new="${new_filename%.ts}"
                old_import_path="src/resolvers/mutations/$entity_name/$base_name_old"
                new_import_path="src/resolvers/$entity_name/$base_name_new"
                import_map["$old_import_path"]="$new_import_path"
            fi
        done
    fi

    # Build import mapping for objects
    object_dir="$SRC_DIR/object/$entity_name"
    if [ -d "$object_dir" ]; then
        for file in "$object_dir"/*; do
            [ ! -f "$file" ] && continue
            filename=$(basename "$file")
            if [[ "$filename" == *.ts ]]; then
                base_name="${filename%.ts}"
                old_import_path="src/resolvers/object/$entity_name/$base_name"
                new_import_path="src/resolvers/$entity_name/$base_name"
                import_map["$old_import_path"]="$new_import_path"
            fi
        done
    fi
done

# Update all import paths across all TypeScript files and .history.json (once for all entities)
if [ ${#import_map[@]} -gt 0 ]; then
    echo "Updating import paths for all files..."
    for old_path in "${!import_map[@]}"; do
        new_path="${import_map[$old_path]}"
        echo "  Updating imports: $old_path -> $new_path"
        find "$SRC_DIR" -name "*.ts" -type f -exec sed -i.bak "s|$old_path|$new_path|g" {} \;
    done

    # Update .history.json file if it exists
    history_file="src/.history.json"
    if [ -f "$history_file" ]; then
        echo "  Updating .history.json file..."

        # Create a temporary file for the updated JSON
        temp_file=$(mktemp)

        # Process the JSON file line by line to find and update resolver paths
        while IFS= read -r line; do
            updated_line="$line"

            # Check for queries pattern: resolvers/queries/{entity}/{filename}
            if [[ "$line" =~ \"resolvers/queries/([^/]+)/([^\"]+)\" ]]; then
                entity="${BASH_REMATCH[1]}"
                filename="${BASH_REMATCH[2]}"
                # Replace "Resolver" with "Query" in filename
                new_filename="${filename/Resolver/Query}"
                old_path="resolvers/queries/$entity/$filename"
                new_path="resolvers/$entity/$new_filename"
                updated_line="${line//$old_path/$new_path}"
            fi

            # Check for mutations pattern: resolvers/mutations/{entity}/{filename}
            if [[ "$line" =~ \"resolvers/mutations/([^/]+)/([^\"]+)\" ]]; then
                entity="${BASH_REMATCH[1]}"
                filename="${BASH_REMATCH[2]}"
                # Replace "Resolver" with "Mutation" in filename
                new_filename="${filename/Resolver/Mutation}"
                old_path="resolvers/mutations/$entity/$filename"
                new_path="resolvers/$entity/$new_filename"
                updated_line="${updated_line//$old_path/$new_path}"
            fi

            # Check for objects pattern: resolvers/objects/{entity}/{filename}
            if [[ "$line" =~ \"resolvers/objects/([^/]+)/([^\"]+)\" ]]; then
                entity="${BASH_REMATCH[1]}"
                filename="${BASH_REMATCH[2]}"
                # No filename change for objects
                old_path="resolvers/objects/$entity/$filename"
                new_path="resolvers/$entity/$filename"
                updated_line="${updated_line//$old_path/$new_path}"
            fi

            echo "$updated_line" >> "$temp_file"
        done < "$history_file"

        # Replace the original file with the updated one
        mv "$temp_file" "$history_file"
        echo "    Updated .history.json with resolver path changes"
    fi

    # Clean up backup files
    find "$SRC_DIR" -name "*.ts.bak" -type f -delete
    echo "Import updates complete!"
fi

# Now move all files
echo "Moving files to new structure..."
for schema_file in "$SCHEMA_DIR"/*.graphql; do
    # Skip if no .graphql files found
    [ ! -f "$schema_file" ] && continue

    # Extract the base name without extension (e.g., "author" from "author.graphql")
    entity_name=$(basename "$schema_file" .graphql)

    echo "Moving files for entity: $entity_name"

    # Create target directory if it doesn't exist
    target_dir="$SRC_DIR/$entity_name"
    mkdir -p "$target_dir"

    # Now move the files
    # Process queries directory
    queries_dir="$SRC_DIR/queries/$entity_name"
    if [ -d "$queries_dir" ]; then
        echo "  Moving files from queries/$entity_name to $entity_name/"
        for file in "$queries_dir"/*; do
            [ ! -f "$file" ] && continue
            filename=$(basename "$file")
            new_filename="${filename/Resolver/Query}"
            mv "$file" "$target_dir/$new_filename"
            echo "    Moved: $filename -> $new_filename"
        done
        # Remove empty directory if it exists
        rmdir "$queries_dir" 2>/dev/null || true
    fi

    # Process mutations directory
    mutations_dir="$SRC_DIR/mutations/$entity_name"
    if [ -d "$mutations_dir" ]; then
        echo "  Moving files from mutations/$entity_name to $entity_name/"
        for file in "$mutations_dir"/*; do
            [ ! -f "$file" ] && continue
            filename=$(basename "$file")
            new_filename="${filename/Resolver/Mutation}"
            mv "$file" "$target_dir/$new_filename"
            echo "    Moved: $filename -> $new_filename"
        done
        # Remove empty directory if it exists
        rmdir "$mutations_dir" 2>/dev/null || true
    fi

    # Process object directory
    object_dir="$SRC_DIR/object/$entity_name"
    if [ -d "$object_dir" ]; then
        echo "  Moving files from object/$entity_name to $entity_name/"
        for file in "$object_dir"/*; do
            [ ! -f "$file" ] && continue
            filename=$(basename "$file")
            mv "$file" "$target_dir/$filename"
            echo "    Moved: $filename (no rename)"
        done
        # Remove empty directory if it exists
        rmdir "$object_dir" 2>/dev/null || true
    fi
done

# Clean up empty parent directories
for dir in "$SRC_DIR/queries" "$SRC_DIR/mutations" "$SRC_DIR/object"; do
    if [ -d "$dir" ] && [ -z "$(ls -A "$dir")" ]; then
        rmdir "$dir"
        echo "Removed empty directory: $dir"
    fi
done

echo "GraphQL file reorganization complete!"
