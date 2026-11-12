#if defined(_WIN32)
#include <Windows.h>

#define CG_EXPORT extern "C" __declspec(dllexport)
#define CG_CALL __fastcall

CG_EXPORT void CG_CALL Plugin_Init() noexcept {
    OutputDebugStringA("[ChaoticGamingCore] Plugin_Init: lifecycle proof of concept loaded.\n");
}

CG_EXPORT void CG_CALL Plugin_Unload() noexcept {
    OutputDebugStringA("[ChaoticGamingCore] Plugin_Unload: lifecycle proof of concept unloaded.\n");
}
#else
#error "The ATLAS plugin proof of concept currently targets the Windows x64 server runtime."
#endif
