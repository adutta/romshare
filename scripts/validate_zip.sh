#!/bin/bash
if [ -z "$1" ]
then
	echo please provide a filename
	exit 1
fi
UPDATE_BINARY=$(unzip -l $1 | grep META-INF/com/google/android/update-binary)
UPDATE_SCRIPT=$(unzip -l $1 | grep META-INF/com/google/android/update-script)

if [ -z "$UPDATE_BINARY" -a -z "$UPDATE_SCRIPT" ]
then
	echo no update-binary or update-script found
	exit 1
fi

echo
echo
echo $UPDATE_BINARY
echo $UPDATE_SCRIPT

echo valid zip