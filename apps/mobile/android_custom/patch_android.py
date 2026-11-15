#!/usr/bin/env python3
import os
import glob
import shutil
import xml.etree.ElementTree as ET

def patch():
    manifest_path = "android/app/src/main/AndroidManifest.xml"
    if not os.path.exists(manifest_path):
        print(f"Error: {manifest_path} not found")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Permissions to add
    permissions = """
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
    <uses-permission android:name="android.permission.USE_BIOMETRIC" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
"""

    if "<uses-permission" not in content:
        content = content.replace("<application", permissions + "    <application")

    # Set legacy external storage & large heap for video uploading
    if 'android:requestLegacyExternalStorage="true"' not in content:
        content = content.replace("<application", '<application android:requestLegacyExternalStorage="true" android:largeHeap="true"')
    elif 'android:largeHeap="true"' not in content:
        content = content.replace("<application", '<application android:largeHeap="true"')

    # Set app label
    content = content.replace('android:label="noor_drive_app"', 'android:label="NOOR DRIVE"')

    # Safely replace launchMode without creating duplicate attributes
    if 'android:launchMode="singleTop"' in content:
        content = content.replace('android:launchMode="singleTop"', 'android:launchMode="singleTask"')
    elif 'android:launchMode' not in content:
        content = content.replace('<activity', '<activity android:launchMode="singleTask"')

    # Add Intent Filters for Receive Sharing (SEND & SEND_MULTIPLE)
    share_filters = """
            <!-- System Share Sheet Intent Filters for Gallery & File Sharing -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="*/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND_MULTIPLE" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="*/*" />
            </intent-filter>
"""
    if 'android.intent.action.SEND' not in content:
        # Insert after the main launcher intent-filter
        marker = '</intent-filter>'
        idx = content.find(marker)
        if idx != -1:
            content = content[:idx + len(marker)] + share_filters + content[idx + len(marker):]

    # Validate XML parsing
    try:
        ET.fromstring(content)
        print("✅ AndroidManifest.xml passed XML structural validation!")
    except Exception as e:
        print(f"❌ XML validation failed: {e}")
        raise e

    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ Successfully patched AndroidManifest.xml with permissions and share intent filters!")

    # Copy custom MainActivity.kt
    custom_main = "android_custom/MainActivity.kt"
    main_kt = glob.glob("android/app/src/**/MainActivity.kt", recursive=True)
    main_java = glob.glob("android/app/src/**/MainActivity.java", recursive=True)
    if os.path.exists(custom_main):
        if main_kt:
            shutil.copyfile(custom_main, main_kt[0])
            print(f"✅ Successfully copied {custom_main} to {main_kt[0]}!")
        elif main_java:
            target_dir = os.path.dirname(main_java[0])
            os.remove(main_java[0])
            target_kt = os.path.join(target_dir, "MainActivity.kt")
            shutil.copyfile(custom_main, target_kt)
            print(f"✅ Replaced {main_java[0]} with {custom_main} at {target_kt}!")
        else:
            pkg_dir = "android/app/src/main/kotlin/com/noordrive/app"
            os.makedirs(pkg_dir, exist_ok=True)
            target = os.path.join(pkg_dir, "MainActivity.kt")
            shutil.copyfile(custom_main, target)
            print(f"✅ Placed {custom_main} into {target}!")
    else:
        print("⚠️ Could not find custom MainActivity.kt")

if __name__ == "__main__":
    patch()
