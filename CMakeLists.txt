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
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/plugins/ChaoticGamingCore"
  LIBRARY_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/plugins/ChaoticGamingCore"
)

# Portable domain contracts are compiled and tested alongside the Windows plugin.
add_library(chaotic_atlas_contracts INTERFACE)
target_include_directories(chaotic_atlas_contracts INTERFACE
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
)
target_compile_features(chaotic_atlas_contracts INTERFACE cxx_std_17)

include(CTest)
if(BUILD_TESTING)
  add_executable(atlas_contracts_test tests/contracts_test.cpp)
  target_link_libraries(atlas_contracts_test PRIVATE chaotic_atlas_contracts)
  add_test(NAME atlas_contracts_test COMMAND atlas_contracts_test)
endif()
