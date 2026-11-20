import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart' as enc;

/// Zero-Knowledge Client-Side Encryption Service
/// Encrypts files with AES-256 before they leave the client / device.
/// The encryption passphrase is NEVER sent to the server.
class EncryptionService {
  static const String magicHeader = 'NDENC1::'; // NOOR DRIVE Encrypted v1

  /// Derives a 32-byte (256-bit) AES key from the user passphrase using SHA-256
  static enc.Key deriveKey(String passphrase) {
    final bytes = utf8.encode(passphrase.trim());
    final digest = sha256.convert(bytes);
    return enc.Key(Uint8List.fromList(digest.bytes));
  }

  /// Encrypts raw data bytes with AES-256-CBC and prepends magic header + IV
  static Uint8List encryptBytes(Uint8List plainBytes, String passphrase) {
    final key = deriveKey(passphrase);
    final iv = enc.IV.fromSecureRandom(16);
    final encrypter = enc.Encrypter(enc.AES(key, mode: enc.AESMode.cbc));

    final encrypted = encrypter.encryptBytes(plainBytes, iv: iv);

    final headerBytes = utf8.encode(magicHeader);
    final builder = BytesBuilder();
    builder.add(headerBytes);
    builder.add(iv.bytes);
    builder.add(encrypted.bytes);

    return builder.toBytes();
  }

  /// Decrypts raw encrypted data bytes using the passphrase
  static Uint8List decryptBytes(Uint8List encryptedData, String passphrase) {
    final headerBytes = utf8.encode(magicHeader);
    if (encryptedData.length < headerBytes.length + 16) {
      throw Exception('Invalid encrypted file format or corrupted file.');
    }

    // Verify magic header
    for (int i = 0; i < headerBytes.length; i++) {
      if (encryptedData[i] != headerBytes[i]) {
        throw Exception('File is not encrypted with NOOR DRIVE Zero-Knowledge format.');
      }
    }

    final key = deriveKey(passphrase);
    final ivBytes = encryptedData.sublist(headerBytes.length, headerBytes.length + 16);
    final cipherBytes = encryptedData.sublist(headerBytes.length + 16);

    final iv = enc.IV(ivBytes);
    final encrypter = enc.Encrypter(enc.AES(key, mode: enc.AESMode.cbc));

    final decrypted = encrypter.decryptBytes(enc.Encrypted(cipherBytes), iv: iv);
    return Uint8List.fromList(decrypted);
  }

  /// Encrypts an existing file on disk and writes to target path
  static Future<File> encryptFile({
    required File inputFile,
    required File outputFile,
    required String passphrase,
  }) async {
    final rawBytes = await inputFile.readAsBytes();
    final encryptedBytes = encryptBytes(rawBytes, passphrase);
    return await outputFile.writeAsBytes(encryptedBytes, flush: true);
  }

  /// Decrypts an existing file on disk and writes to target path
  static Future<File> decryptFile({
    required File inputFile,
    required File outputFile,
    required String passphrase,
  }) async {
    final rawBytes = await inputFile.readAsBytes();
    final decryptedBytes = decryptBytes(rawBytes, passphrase);
    return await outputFile.writeAsBytes(decryptedBytes, flush: true);
  }

  /// Checks if a file has the NOOR DRIVE Zero-Knowledge magic header
  static Future<bool> isEncryptedFile(File file) async {
    if (!await file.exists()) return false;
    final length = await file.length();
    final headerLen = magicHeader.length;
    if (length < headerLen) return false;

    final stream = file.openRead(0, headerLen);
    final bytes = await stream.first;
    final prefix = utf8.decode(bytes.take(headerLen).toList(), allowMalformed: true);
    return prefix == magicHeader;
  }
}
