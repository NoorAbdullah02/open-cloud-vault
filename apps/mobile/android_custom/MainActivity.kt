package com.noordrive.app.noor_drive_app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterFragmentActivity() {
    private val CHANNEL = "com.noordrive.app/sharing"
    private var sharedFiles = mutableListOf<Map<String, String>>()
    private var methodChannel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
        methodChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "getSharedFiles" -> {
                    result.success(ArrayList(sharedFiles))
                }
                "clearSharedFiles" -> {
                    try {
                        val cacheDir = File(cacheDir, "shared_incoming")
                        if (cacheDir.exists()) {
                            cacheDir.listFiles()?.forEach { it.delete() }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                    sharedFiles.clear()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action) {
            val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (uri != null) {
                processUri(uri, type)
            } else {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                if (!text.isNullOrEmpty()) {
                    val map = HashMap<String, String>()
                    map["text"] = text
                    map["type"] = "text"
                    sharedFiles.add(map)
                }
            }
            notifyFlutter()
        } else if (Intent.ACTION_SEND_MULTIPLE == action) {
            val uris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            if (uris != null) {
                for (uri in uris) {
                    processUri(uri, type)
                }
            }
            notifyFlutter()
        }
    }

    private fun processUri(uri: Uri, mimeType: String?) {
        try {
            var fileName = "shared_${System.currentTimeMillis()}"
            val cursor = contentResolver.query(uri, null, null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex != -1) {
                        val name = it.getString(nameIndex)
                        if (!name.isNullOrEmpty()) fileName = name
                    }
                }
            }

            val cacheDir = File(cacheDir, "shared_incoming")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val targetFile = File(cacheDir, "${System.currentTimeMillis()}_$fileName")

            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }

            if (targetFile.exists() && targetFile.length() > 0) {
                val map = HashMap<String, String>()
                map["path"] = targetFile.absolutePath
                map["name"] = fileName
                map["mimeType"] = mimeType ?: "application/octet-stream"
                sharedFiles.add(map)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun notifyFlutter() {
        if (sharedFiles.isNotEmpty()) {
            methodChannel?.invokeMethod("onFilesShared", ArrayList(sharedFiles))
        }
    }
}

