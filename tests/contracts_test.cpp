#include "chaotic/atlas/contracts.hpp"

#include <cassert>
#include <type_traits>

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

  assert(status.state == ServerState::online);
  assert(status.online_players.value() == 12);

  EventEnvelope event{};
  event.event_id = "test-event";
  event.kind = EventKind::character_transferred;
  event.player = PlayerIdentity{};
  assert(event.schema_version == 1);
  assert(event.player.has_value());

  return 0;
}
