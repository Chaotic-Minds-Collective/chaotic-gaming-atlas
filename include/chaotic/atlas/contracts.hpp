#pragma once

#include <chrono>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace chaotic::atlas {

using UtcTime = std::chrono::system_clock::time_point;

enum class ServerState {
  unknown,
  starting,
  online,
  stopping,
  offline,
  maintenance
};

enum class EventKind {
  player_connected,
  player_disconnected,
  player_died,
  character_created,
  character_transferred,
  tribe_created,
  tribe_member_joined,
  tribe_member_left,
  server_state_changed
};

struct ServerIdentity {
  std::string cluster_id;
  std::string grid_id;
  std::string server_id;
};

struct PlayerIdentity {
  std::optional<std::string> platform_id;
  std::optional<std::string> chaotic_player_id;
  std::optional<std::string> character_id;
  std::optional<std::string> character_name;
};

struct PlayerSession {
  PlayerIdentity player;
  ServerIdentity server;
  UtcTime connected_at;
  std::optional<UtcTime> disconnected_at;
};

struct CharacterTransfer {
  PlayerIdentity player;
  std::string source_grid_id;
  std::string destination_grid_id;
  UtcTime occurred_at;
};

struct ServerStatus {
  ServerIdentity server;
  ServerState state{ServerState::unknown};
  std::optional<std::uint32_t> online_players;
  UtcTime observed_at;
};

struct EventEnvelope {
  std::string event_id;
  std::uint32_t schema_version{1};
  EventKind kind{EventKind::server_state_changed};
  ServerIdentity server;
  UtcTime occurred_at;
  std::optional<PlayerIdentity> player;
  std::optional<std::string> tribe_id;
  std::optional<std::string> correlation_id;
};

}  // namespace chaotic::atlas
