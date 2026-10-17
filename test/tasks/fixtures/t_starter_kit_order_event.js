module.exports = [
  {
    id: '7a1b2c3d-0000-4000-8000-000000000001',
    order_id: '5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a01',
    type: 'status_changed',
    payload: { from: null, to: 'paid' },
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
  {
    id: '7a1b2c3d-0000-4000-8000-000000000002',
    order_id: '5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a01',
    type: 'email_sent',
    payload: { template: 'starter_kit_order_confirmed' },
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
];
