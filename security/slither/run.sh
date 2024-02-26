#!/bin/bash

if ! command -v slither &> /dev/null
then
    echo "Slither could not be found."
    echo "Please install slither and try again."
    exit
fi

cd "$(dirname "$0")/../../"

rm -rf security/slither/slither-report-*.sarif
slither . --exclude-dependencies --filter-paths "@openzeppelin|mock" --sarif security/slither/slither-report-$(date +%s).sarif > /dev/null 2>&1

if [ -f security/slither/slither-report-*.sarif ]; then
    echo "Slither report generated successfully."
else
    echo "Slither report generation failed."
fi