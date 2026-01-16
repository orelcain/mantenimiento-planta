/*
 * network_local.h - Sistema de Red Local ESP32
 * 
 * Maneja:
 * - Access Point (AP) siempre activo
 * - Captive Portal automático (iOS/Android/Windows)
 * - Servidor HTTP para dashboard y API
 * - DNS para redirección captive portal
 */

#ifndef NETWORK_LOCAL_H
#define NETWORK_LOCAL_H

#include <Arduino.h>
#include <WebServer.h>

// ============ CONFIGURACIÓN ============
#define AP_SSID_DEFAULT     "Esp32-Sensor"
#define DNS_PORT            53
#define HTTP_PORT           80

// IP del AP (constantes globales)
static const IPAddress AP_IP(192, 168, 4, 1);
static const IPAddress AP_GATEWAY(192, 168, 4, 1);
static const IPAddress AP_SUBNET(255, 255, 255, 0);

// ============ SERVIDOR HTTP GLOBAL ============
// Definido en network_local.cpp - usado por main.cpp y webserver_local.cpp
extern WebServer portalServer;

// ============ FUNCIONES PÚBLICAS ============

/**
 * Inicializa el sistema de red local (AP + DNS + endpoints captive)
 * NO inicia el servidor HTTP - usar networkLocalStartServer()
 */
void networkLocalInit();

/**
 * Inicia el servidor HTTP (llamar después de registrar endpoints)
 */
void networkLocalStartServer();

/**
 * Procesa peticiones HTTP y DNS - llamar en loop()
 */
void networkLocalLoop();

/**
 * Configura el SSID personalizado del AP
 */
void networkLocalSetApSsid(const String& ssid);

/**
 * Configura la contraseña del AP (>= 8 chars para WPA2)
 */
void networkLocalSetApPassword(const String& password);

/**
 * Obtiene el SSID actual del AP
 */
String networkLocalGetApSsid();

/**
 * Verifica cuántos clientes están conectados al AP
 */
uint8_t networkLocalGetClientCount();

/**
 * Referencia al servidor HTTP (para agregar endpoints externos)
 */
WebServer& getHttpServer();

/**
 * Indica si el servidor HTTP está activo
 */
bool networkLocalIsReady();

#endif // NETWORK_LOCAL_H
