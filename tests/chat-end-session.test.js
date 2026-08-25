const {
  roomOwnedBySocket,
  canAgentResolveRoom,
} = require('../ecommerce-chat/socket/chatAuth');

describe('chat end-session ownership', () => {
  const room = {
    guest_session_id: 'guest-abc',
    user_id: 'user-1',
    assigned_agent_id: 'agent-9',
  };

  test('customer owns room via guest_session_id', () => {
    expect(
      roomOwnedBySocket(room, { data: { guest_session_id: 'guest-abc' } })
    ).toBe(true);
  });

  test('different guest cannot end another session', () => {
    expect(
      roomOwnedBySocket(room, { data: { guest_session_id: 'guest-other' } })
    ).toBe(false);
  });

  test('logged-in user owns room via user_id', () => {
    expect(
      roomOwnedBySocket(room, {
        data: { guest_session_id: 'other', user_id: 'user-1' },
      })
    ).toBe(true);
  });

  test('missing socket or room is unauthorized', () => {
    expect(roomOwnedBySocket(null, { data: {} })).toBe(false);
    expect(roomOwnedBySocket(room, null)).toBe(false);
  });

  test('assigned agent can resolve', () => {
    expect(
      canAgentResolveRoom(room, { _id: 'agent-9', role: 'AGENT' })
    ).toBe(true);
  });

  test('other AGENT cannot resolve an assigned room', () => {
    expect(
      canAgentResolveRoom(room, { _id: 'agent-2', role: 'AGENT' })
    ).toBe(false);
  });

  test('ADMIN and SUPER_ADMIN can resolve any room', () => {
    expect(
      canAgentResolveRoom(room, { _id: 'agent-2', role: 'ADMIN' })
    ).toBe(true);
    expect(
      canAgentResolveRoom(room, { _id: 'agent-2', role: 'SUPER_ADMIN' })
    ).toBe(true);
  });

  test('any authenticated agent can resolve an unassigned room', () => {
    expect(
      canAgentResolveRoom(
        { assigned_agent_id: null },
        { _id: 'agent-2', role: 'AGENT' }
      )
    ).toBe(true);
  });
});
