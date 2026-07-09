#!/usr/bin/env bash
echo "Recommended build commands:"
npm --prefix site ci
npm --prefix site run build
