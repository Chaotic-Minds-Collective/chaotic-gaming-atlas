#if defined(_WIN32)
#include <Windows.h>
#include <cstdio>

#define CG_EXPORT extern "C" __declspec(dllexport)
#define CG_CALL __fastcall

#ifndef CG_PLUGIN_VERSION
#define CG_PLUGIN_VERSION "0.1.0"
#endif

#ifndef CG_ATLAS_API_VERSION
#define CG_ATLAS_API_VERSION "1.71"
#endif

namespace {
constexpr char kPluginName[] = "Chaotic Gaming Core";

void readEnvironment(const char* name, char* value, DWORD capacity) noexcept {
    if (capacity == 0) return;

    const DWORD length = GetEnvironmentVariableA(name, value, capacity);
    if (length == 0 || length >= capacity) {
        std::snprintf(value, capacity, "%s", "unreported");
    }
}

void logLifecycle(const char* eventName) noexcept {
    char serverBuild[128]{};
    char runtimeApiVersion[64]{};
    char message[512]{};

    readEnvironment("ATLAS_SERVER_BUILD", serverBuild, static_cast<DWORD>(sizeof(serverBuild)));
    readEnvironment("ATLAS_SERVER_API_VERSION", runtimeApiVersion, static_cast<DWORD>(sizeof(runtimeApiVersion)));

    std::snprintf(
        message,
        sizeof(message),
        "[%s] %s | pluginVersion=%s | serverBuild=%s | runtimeApi=%s | candidateApi=%s\n",
        kPluginName,
        eventName,
        CG_PLUGIN_VERSION,
        serverBuild,
        runtimeApiVersion,
        CG_ATLAS_API_VERSION
    );
    OutputDebugStringA(message);
}
} // namespace

CG_EXPORT void CG_CALL Plugin_Init() noexcept {
    logLifecycle("Plugin_Init");
}

CG_EXPORT void CG_CALL Plugin_Unload() noexcept {
    logLifecycle("Plugin_Unload");
}

#else
#error "The ATLAS plugin proof of concept currently targets the Windows x64 server runtime."
#endif
