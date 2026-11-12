cmake_minimum_required(VERSION 3.24)
project(ChaoticGamingAtlas LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "The initial ATLAS plugin target is Windows-only.")
endif()

add_library(ChaoticGamingCore SHARED
  plugins/ChaoticGamingCore/src/plugin.cpp
)

target_compile_features(ChaoticGamingCore PRIVATE cxx_std_17)
target_compile_definitions(ChaoticGamingCore PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
set_target_properties(ChaoticGamingCore PROPERTIES
  PREFIX ""
  OUTPUT_NAME "ChaoticGamingCore"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/plugins/ChaoticGamingCore"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/plugins/ChaoticGamingCore"
)
