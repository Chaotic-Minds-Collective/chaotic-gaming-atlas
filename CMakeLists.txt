cmake_minimum_required(VERSION 3.20)
project(ChaoticGamingAtlasContracts VERSION 0.1.0 LANGUAGES CXX)

add_library(chaotic_atlas_contracts INTERFACE)
target_include_directories(chaotic_atlas_contracts INTERFACE
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
)
target_compile_features(chaotic_atlas_contracts INTERFACE cxx_std_17)

option(CHAOTIC_ATLAS_BUILD_TESTS "Build contract tests" ON)
if(CHAOTIC_ATLAS_BUILD_TESTS)
  enable_testing()
  add_executable(atlas_contracts_test tests/contracts_test.cpp)
  target_link_libraries(atlas_contracts_test PRIVATE chaotic_atlas_contracts)
  add_test(NAME atlas_contracts_test COMMAND atlas_contracts_test)
endif()
