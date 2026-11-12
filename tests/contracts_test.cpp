#include "chaotic/atlas/contracts.hpp"

#include <cstdlib>
#include <iostream>
#include <type_traits>

#define ATLAS_CHECK(condition)                            \
  do {                                                    \
    if (!(condition)) {                                   \
      std::cerr << "Check failed: " #condition << '\n';   \
      return EXIT_FAILURE;                                \
    }                                                     \
  } while (false)

int main() {
  using namespace chaotic::atlas;

  static_assert(std::is_default_constructible<ServerStatus>::value,
                "ServerStatus must be default constructible");
  static_assert(std::is_default_constructible<EventEnvelope>::value,
                "EventEnvelope must be default constructible");

  ServerStatus status{};
  status.server.cluster_id = "main";
  status.server.grid_id = "A1";
  status.server.server_id = "A1-east";
  status.state = ServerState::online;
  status.online_players = 12;

  ATLAS_CHECK(status.state == ServerState::online);
  ATLAS_CHECK(status.online_players.value() == 12);

  EventEnvelope event{};
  event.event_id = "test-event";
  event.kind = EventKind::character_transferred;
  event.player = PlayerIdentity{};
  ATLAS_CHECK(event.schema_version == 1);
  ATLAS_CHECK(event.player.has_value());

  return EXIT_SUCCESS;
}
