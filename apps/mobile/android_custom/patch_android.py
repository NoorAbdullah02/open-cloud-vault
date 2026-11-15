#!/usr/bin/env python3
import os
import glob
import re
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

    # Keep singleTop launchMode (Flutter default & safest for activity restoration)
    if 'android:launchMode="singleTask"' in content:
        content = content.replace('android:launchMode="singleTask"', 'android:launchMode="singleTop"')
    elif 'android:launchMode' not in content:
        content = content.replace('<activity', '<activity android:launchMode="singleTop"')

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

    # Copy custom MainActivity.kt with dynamic package name matching
    custom_main = "android_custom/MainActivity.kt"
    main_kt = glob.glob("android/app/src/**/MainActivity.kt", recursive=True)
    main_java = glob.glob("android/app/src/**/MainActivity.java", recursive=True)

    if os.path.exists(custom_main):
        target = main_kt[0] if main_kt else (main_java[0] if main_java else None)
        orig_pkg = "com.noordrive.app.noor_drive_app"  # canonical fallback

        if target and os.path.exists(target):
            with open(target, "r", encoding="utf-8") as f:
                for line in f:
                    line_clean = line.strip()
                    if line_clean.startswith("package "):
                        orig_pkg = line_clean.replace("package ", "").rstrip(";").strip()
                        print(f"📦 Detected Android Package Name: {orig_pkg}")
                        break

        with open(custom_main, "r", encoding="utf-8") as f:
            kt_code = f.read()

        # Replace package declaration with the detected orig_pkg
        kt_code = re.sub(r"^package\s+[\w\.]+", f"package {orig_pkg}", kt_code, count=1)

        if target:
            target_kt = target if target.endswith(".kt") else os.path.join(os.path.dirname(target), "MainActivity.kt")
            if target.endswith(".java") and os.path.exists(target):
                os.remove(target)
            with open(target_kt, "w", encoding="utf-8") as f:
                f.write(kt_code)
            print(f"✅ Successfully written custom MainActivity with package {orig_pkg} to {target_kt}!")
        else:
            pkg_path = orig_pkg.replace(".", "/")
            pkg_dir = os.path.join("android/app/src/main/kotlin", pkg_path)
            os.makedirs(pkg_dir, exist_ok=True)
            target_kt = os.path.join(pkg_dir, "MainActivity.kt")
            with open(target_kt, "w", encoding="utf-8") as f:
                f.write(kt_code)
            print(f"✅ Placed custom MainActivity into {target_kt} with package {orig_pkg}!")
    else:
        print("⚠️ Could not find custom MainActivity.kt")

if __name__ == "__main__":
    patch()
