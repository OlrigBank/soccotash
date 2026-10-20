#!/usr/bin/env python3
"""Compare every saved source and derived value with a reference workbook."""
import argparse
import json
import sys
from reservation_analysis.comparison import compare


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', required=True)
    parser.add_argument('--actual', required=True)
    args = parser.parse_args()
    result = compare(args.reference, args.actual)
    print(json.dumps(result, indent=2))
    return 0 if result['matched'] else 1


if __name__ == '__main__':
    sys.exit(main())
