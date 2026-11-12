#if defined(_WIN32)
#include <Windows.h>
#include <WinHttp.h>
#include <atomic>
#include <cctype>
#include <cwctype>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#define CG_EXPORT extern "C" __declspec(dllexport)
#define CG_CALL __fastcall

#ifndef CG_PLUGIN_VERSION
#define CG_PLUGIN_VERSION "0.2.0"
#endif
#ifndef CG_ATLAS_API_VERSION
#define CG_ATLAS_API_VERSION "1.71"
#endif

namespace {
constexpr char kPluginName[] = "Chaotic Gaming Core";
constexpr char kAdapterVersion[] = CG_PLUGIN_VERSION;

std::atomic<bool> g_stop{true};
// Serializes worker ownership and configuration across loader callbacks.
std::mutex g_lifecycleMutex;
std::mutex g_waitMutex;
std::condition_variable g_waitCondition;
std::thread g_heartbeatThread;
std::string g_coreApiUrl;
std::string g_serviceToken;
std::string g_serverId;
std::string g_serverBuild{"unknown"};
unsigned int g_intervalSeconds{60};

std::string readEnvironment(const char* name) {
    const DWORD required = GetEnvironmentVariableA(name, nullptr, 0);
    if (required == 0 || required > 4096) return {};
    std::vector<char> buffer(required);
    const DWORD copied = GetEnvironmentVariableA(name, buffer.data(), required);
    if (copied == 0 || copied >= required) return {};
    return std::string(buffer.data(), copied);
}

void logMessage(const char* message) noexcept {
    OutputDebugStringA(message);
}

void logLifecycle(const char* eventName) noexcept {
    char serverBuild[128]{};
    char runtimeApiVersion[64]{};
    char message[512]{};

    const std::string build = readEnvironment("ATLAS_SERVER_BUILD");
    const std::string runtimeApi = readEnvironment("ATLAS_SERVER_API_VERSION");
    std::snprintf(serverBuild, sizeof(serverBuild), "%s", build.empty() ? "unreported" : build.c_str());
    std::snprintf(runtimeApiVersion, sizeof(runtimeApiVersion), "%s", runtimeApi.empty() ? "unreported" : runtimeApi.c_str());

    std::snprintf(
        message,
        sizeof(message),
        "[%s] %s | pluginVersion=%s | serverBuild=%s | runtimeApi=%s | candidateApi=%s\n",
        kPluginName, eventName, kAdapterVersion, serverBuild, runtimeApiVersion, CG_ATLAS_API_VERSION
    );
    logMessage(message);
}

bool isUuid(const std::string& value) noexcept {
    if (value.size() != 36) return false;
    for (std::size_t i = 0; i < value.size(); ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (value[i] != '-') return false;
        } else if (!std::isxdigit(static_cast<unsigned char>(value[i]))) {
            return false;
        }
    }
    return true;
}

bool isServiceToken(const std::string& value) noexcept {
    constexpr char prefix[] = "cg_srv_";
    if (value.rfind(prefix, 0) != 0 || value.size() < 47) return false;
    for (std::size_t i = sizeof(prefix) - 1; i < value.size(); ++i) {
        const unsigned char ch = static_cast<unsigned char>(value[i]);
        if (!std::isalnum(ch) && ch != '_' && ch != '-') return false;
    }
    return true;
}

std::string jsonEscape(const std::string& value) {
    std::string escaped;
    escaped.reserve(value.size() + 8);
    constexpr char hex[] = "0123456789abcdef";
    for (const unsigned char ch : value) {
        switch (ch) {
            case '"': escaped += "\\\""; break;
            case '\\': escaped += "\\\\"; break;
            case '\b': escaped += "\\b"; break;
            case '\f': escaped += "\\f"; break;
            case '\n': escaped += "\\n"; break;
            case '\r': escaped += "\\r"; break;
            case '\t': escaped += "\\t"; break;
            default:
                if (ch < 0x20) {
                    escaped += "\\u00";
                    escaped += hex[(ch >> 4) & 0x0f];
                    escaped += hex[ch & 0x0f];
                } else {
                    escaped += static_cast<char>(ch);
                }
        }
    }
    return escaped;
}

struct WinHttpHandle {
    HINTERNET value{};
    ~WinHttpHandle() { if (value) WinHttpCloseHandle(value); }
    WinHttpHandle(const WinHttpHandle&) = delete;
    WinHttpHandle& operator=(const WinHttpHandle&) = delete;
    explicit WinHttpHandle(HINTERNET handle) : value(handle) {}
};

bool sendCoreHeartbeat() {
    std::wstring wideUrl(g_coreApiUrl.begin(), g_coreApiUrl.end());
    URL_COMPONENTS parts{};
    parts.dwStructSize = sizeof(parts);
    parts.dwSchemeLength = static_cast<DWORD>(-1);
    parts.dwUserNameLength = static_cast<DWORD>(-1);
    parts.dwPasswordLength = static_cast<DWORD>(-1);
    parts.dwHostNameLength = static_cast<DWORD>(-1);
    parts.dwUrlPathLength = static_cast<DWORD>(-1);
    parts.dwExtraInfoLength = static_cast<DWORD>(-1);

    if (!WinHttpCrackUrl(wideUrl.c_str(), 0, 0, &parts)) {
        logMessage("[Chaotic Gaming Core] Invalid CORE_API_URL; heartbeat skipped.\n");
        return false;
    }
    const bool secure = parts.nScheme == INTERNET_SCHEME_HTTPS;
    const std::wstring basePath(parts.lpszUrlPath, parts.dwUrlPathLength);
    if ((!secure && parts.nScheme != INTERNET_SCHEME_HTTP) ||
        (!basePath.empty() && basePath != L"/") ||
        parts.dwExtraInfoLength != 0 ||
        parts.dwUserNameLength != 0 ||
        parts.dwPasswordLength != 0) {
        logMessage("[Chaotic Gaming Core] CORE_API_URL must be an HTTP(S) origin without credentials, path or query.\n");
        return false;
    }

    const std::wstring host(parts.lpszHostName, parts.dwHostNameLength);
    std::wstring normalizedHost = host;
    for (wchar_t& ch : normalizedHost) ch = static_cast<wchar_t>(std::towlower(ch));
    const bool loopbackHost = normalizedHost == L"localhost" ||
        normalizedHost == L"127.0.0.1" || normalizedHost == L"::1";
    if (!secure && !loopbackHost) {
        logMessage("[Chaotic Gaming Core] HTTPS is required except for localhost development.\n");
        return false;
    }
    const std::wstring serverId(g_serverId.begin(), g_serverId.end());
    const std::wstring requestPath = L"/integrations/servers/" + serverId + L"/heartbeat";
    const std::wstring headers =
        L"Authorization: Bearer " + std::wstring(g_serviceToken.begin(), g_serviceToken.end()) +
        L"\r\nContent-Type: application/json\r\nAccept: application/json\r\n";

    const std::string body =
        "{\"game\":\"atlas\",\"serverVersion\":\"" + jsonEscape(g_serverBuild) +
        "\",\"adapterVersion\":\"" + jsonEscape(kAdapterVersion) + "\",\"online\":true}";

    WinHttpHandle session(WinHttpOpen(L"ChaoticGamingAtlasAdapter/0.2.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
    if (!session.value) {
        logMessage("[Chaotic Gaming Core] WinHTTP session could not be created.\n");
        return false;
    }
    if (!WinHttpSetTimeouts(session.value, 3000, 3000, 3000, 3000)) {
        logMessage("[Chaotic Gaming Core] WinHTTP timeouts could not be configured; heartbeat skipped.\n");
        return false;
    }

    WinHttpHandle connection(WinHttpConnect(session.value, host.c_str(), parts.nPort, 0));
    if (!connection.value) {
        logMessage("[Chaotic Gaming Core] Core API connection could not be opened.\n");
        return false;
    }

    const DWORD flags = secure ? WINHTTP_FLAG_SECURE : 0;
    WinHttpHandle request(WinHttpOpenRequest(connection.value, L"POST", requestPath.c_str(),
        nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags));
    if (!request.value) {
        logMessage("[Chaotic Gaming Core] Heartbeat request could not be created.\n");
        return false;
    }

    // Never forward the service credential or heartbeat body through a redirect.
    DWORD disableRedirects = WINHTTP_DISABLE_REDIRECTS;
    if (!WinHttpSetOption(request.value, WINHTTP_OPTION_DISABLE_FEATURE,
        &disableRedirects, sizeof(disableRedirects))) {
        logMessage("[Chaotic Gaming Core] Redirect protection could not be enabled; heartbeat skipped.\n");
        return false;
    }

    const BOOL sent = WinHttpSendRequest(
        request.value,
        headers.c_str(),
        static_cast<DWORD>(headers.size()),
        const_cast<char*>(body.data()),
        static_cast<DWORD>(body.size()),
        static_cast<DWORD>(body.size()),
        0
    );
    if (!sent || !WinHttpReceiveResponse(request.value, nullptr)) {
        logMessage("[Chaotic Gaming Core] Heartbeat transport failed; will retry next interval.\n");
        return false;
    }

    DWORD statusCode = 0;
    DWORD statusSize = sizeof(statusCode);
    if (!WinHttpQueryHeaders(request.value,
        WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
        WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusSize, WINHTTP_NO_HEADER_INDEX) ||
        statusCode < 200 || statusCode >= 300) {
        char message[160]{};
        std::snprintf(message, sizeof(message),
            "[Chaotic Gaming Core] Heartbeat rejected (HTTP %lu); will retry.\n",
            static_cast<unsigned long>(statusCode));
        logMessage(message);
        return false;
    }

    logMessage("[Chaotic Gaming Core] ATLAS heartbeat accepted.\n");
    return true;
}

void heartbeatLoop() noexcept {
    while (!g_stop.load()) {
        try {
            sendCoreHeartbeat();
        } catch (...) {
            logMessage("[Chaotic Gaming Core] Unexpected heartbeat error; will retry.\n");
        }

        std::unique_lock<std::mutex> lock(g_waitMutex);
        g_waitCondition.wait_for(lock, std::chrono::seconds(g_intervalSeconds),
            [] { return g_stop.load(); });
    }
}

void startHeartbeat() {
    if (g_heartbeatThread.joinable()) {
        logMessage("[Chaotic Gaming Core] Heartbeat already started; duplicate initialization ignored.\n");
        return;
    }

    g_coreApiUrl = readEnvironment("CHAOTIC_CORE_API_URL");
    g_serviceToken = readEnvironment("CHAOTIC_CORE_SERVICE_TOKEN");
    g_serverId = readEnvironment("CHAOTIC_CORE_SERVER_ID");
    const std::string serverBuild = readEnvironment("ATLAS_SERVER_BUILD");
    g_serverBuild = serverBuild.empty() ? "unknown" : serverBuild;

    if (g_coreApiUrl.empty() || g_serviceToken.empty() || g_serverId.empty()) {
        logMessage("[Chaotic Gaming Core] Heartbeat not configured; lifecycle-only mode.\n");
        return;
    }
    if (!isUuid(g_serverId) || !isServiceToken(g_serviceToken)) {
        logMessage("[Chaotic Gaming Core] Invalid server UUID or service token; heartbeat disabled.\n");
        return;
    }
    if (g_coreApiUrl.rfind("https://", 0) != 0 && g_coreApiUrl.rfind("http://", 0) != 0) {
        logMessage("[Chaotic Gaming Core] CORE_API_URL must use HTTPS (HTTP is allowed only for localhost).\n");
        return;
    }

    const std::string interval = readEnvironment("HEARTBEAT_INTERVAL_SECONDS");
    if (!interval.empty()) {
        char* end = nullptr;
        const unsigned long parsed = std::strtoul(interval.c_str(), &end, 10);
        if (end != interval.c_str() && *end == '\0' && parsed >= 30 && parsed <= 300) {
            g_intervalSeconds = static_cast<unsigned int>(parsed);
        }
    }

    g_stop.store(false);
    g_heartbeatThread = std::thread(heartbeatLoop);
}
} // namespace

CG_EXPORT void CG_CALL Plugin_Init() noexcept {
    logLifecycle("Plugin_Init");
    try {
        std::lock_guard<std::mutex> lifecycleLock(g_lifecycleMutex);
        startHeartbeat();
    } catch (...) {
        logMessage("[Chaotic Gaming Core] Heartbeat initialization failed; plugin remains loaded.\n");
    }
}

CG_EXPORT void CG_CALL Plugin_Unload() noexcept {
    std::lock_guard<std::mutex> lifecycleLock(g_lifecycleMutex);
    {
        std::lock_guard<std::mutex> lock(g_waitMutex);
        g_stop.store(true);
    }
    g_waitCondition.notify_all();
    if (g_heartbeatThread.joinable()) g_heartbeatThread.join();
    logLifecycle("Plugin_Unload");
}

#else
#error "The ATLAS plugin proof of concept currently targets the Windows x64 server runtime."
#endif
