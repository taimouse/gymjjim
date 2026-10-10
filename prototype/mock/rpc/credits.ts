/** 크레딧 지갑 RPC (20261011000100_credits: my_credits · request/cancel/decide_credit_request · adjust_credits) */
import { byId, CENTER_ID, nowIso, raise, table } from '../db';
import { addCredits, insert, me, staffId, update } from './helpers';

type Args = Record<string, unknown>;

const pendingOf = (memberId: unknown) =>
  table('credit_requests')
    .filter((row) => row.member_id === memberId && row.status === 'pending')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

export const creditRpcs = {
  my_credits: {
    mutates: [],
    run: () => {
      const member = me();
      const pending = pendingOf(member.id);
      return {
        balance: Number(member.credit_balance ?? 0),
        price: Number(byId('centers', CENTER_ID)?.credit_price ?? 5000),
        pending: pending
          ? {
              id: pending.id,
              amount: pending.amount,
              unit_price: pending.unit_price,
              created_at: pending.created_at,
            }
          : null,
      };
    },
  },
  request_credit_charge: {
    mutates: ['credit_requests'],
    run: (a: Args) => {
      const amount = Number(a.p_amount);
      if (!Number.isInteger(amount) || amount < 1 || amount > 1000) raise('VALIDATION');
      const member = me();
      if (pendingOf(member.id)) raise('CREDIT_REQUEST_PENDING');
      return insert('credit_requests', {
        center_id: CENTER_ID,
        member_id: member.id,
        amount,
        unit_price: Number(byId('centers', CENTER_ID)?.credit_price ?? 5000),
      }).id;
    },
  },
  cancel_credit_request: {
    mutates: ['credit_requests'],
    run: (a: Args) => {
      const request = byId('credit_requests', a.p_request_id);
      if (!request || request.member_id !== me().id) raise('CREDIT_REQUEST_NOT_FOUND');
      if (request.status !== 'pending') raise('CREDIT_REQUEST_CLOSED');
      update(request, { status: 'cancelled', decided_at: nowIso() });
      return null;
    },
  },
  decide_credit_request: {
    mutates: ['credit_requests', 'members', 'credit_transactions'],
    run: (a: Args) => {
      const request = byId('credit_requests', a.p_request_id);
      if (!request) raise('CREDIT_REQUEST_NOT_FOUND');
      if (request.status !== 'pending') raise('CREDIT_REQUEST_CLOSED');
      const approve = !!a.p_approve;
      update(request, {
        status: approve ? 'approved' : 'rejected',
        decided_at: nowIso(),
        decided_by: staffId(),
      });
      const balance = approve
        ? addCredits(request.member_id, Number(request.amount), 'charge', {
            requestId: request.id,
            staffId: staffId(),
          })
        : null;
      return { request_id: request.id, approved: approve, balance };
    },
  },
  adjust_credits: {
    mutates: ['members', 'credit_transactions'],
    run: (a: Args) => {
      const member = byId('members', a.p_member_id);
      if (!member || member.status !== 'active' || member.deleted_at) raise('MEMBER_NOT_FOUND');
      const delta = Number(a.p_delta);
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) raise('VALIDATION');
      return addCredits(member.id, delta, delta > 0 ? 'charge' : 'adjust', {
        memo: typeof a.p_memo === 'string' ? a.p_memo : null,
        staffId: staffId(),
      });
    },
  },
};
