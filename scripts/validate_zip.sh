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

MODVERSION=$(unzip -p $1 system/build.prop | grep ro.modversion | head -n 1 | cut -d = -f 2)
DEVELOPERID=$(unzip -p $1 system/build.prop | grep ro.rommanager.developerid | head -n 1 | cut -d = -f 2)

echo $MODVERSION
echo $DEVELOPERID
