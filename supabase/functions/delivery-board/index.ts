// PUBLIC ENDPOINT (SPEC §6.4 #3): the job's delivery board link (/d/<project>?t=<token>, printed on the job-site poster).
//
// Why public: drivers, suppliers and subs' crews post deliveries and watch the board (and the trailer TV) without an
// account, the way Jesse's MDR board works. The token is the secret: 32 random bytes, only its SHA-256 stored
// (projects.delivery_token_hash), rotated by deliveries.manage (rotating locks the old link out at once).
//
// What it can do: view the board, post a delivery with a typed name, fetch a receipt it posted. Nothing else: no edit,
// no delete, no photos, no emails, no user ids. Answers carry board fields only (SPEC §13.3), enforced twice: by the
// service-role-only SQL (link_* in migration 0025) and by the projections in _shared/deliveries.ts.
// Rate limits: per IP and per token on every call, and tighter ones on posting.
import { created, handlePublic, HttpError, ok } from '../_shared/http.ts';
import { rpc, serviceClient } from '../_shared/db.ts';
import { parseJson } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { audit } from '../_shared/audit.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { boardAnswer, DeliveryBoardBody, receiptAnswer } from '../_shared/deliveries.ts';

const NOT_ACTIVE = 'This delivery link is not active. Ask the superintendent for the current one.';

Deno.serve(handlePublic(async (req) => {
  const service = serviceClient();
  const ip = clientIp(req) ?? 'unknown';
  // The TV refreshes every 30 seconds; a trailer full of phones shares one IP.
  await limit(service, `delivery-board:ip:${ip}`, 60, 1);
  const body = await parseJson(req, DeliveryBoardBody, 8192);
  const tokenHash = await sha256Hex(body.token);
  const tokenKey = tokenHash.slice(0, 32);
  await limit(service, `delivery-board:token:${tokenKey}`, 240, 4);
  const link = { p_project_id: body.project_id, p_token_hash: tokenHash };

  switch (body.action) {
    case 'board': {
      const raw = await rpc<unknown>(service, 'link_delivery_board', { ...link, p_from: body.from, p_to: body.to });
      if (raw === null) throw new HttpError(404, NOT_ACTIVE);
      return ok(req, boardAnswer(raw));
    }
    case 'post': {
      await limit(service, `delivery-board:post-ip:${ip}`, 10, 10 / 3600);
      await limit(service, `delivery-board:post-token:${tokenKey}`, 60, 60 / 3600);
      const raw = await rpc<unknown>(service, 'link_post_delivery', {
        ...link,
        p_name: body.name,
        p_company: body.company,
        p_date: body.date,
        p_time: body.time,
        p_duration: body.duration_min,
        p_description: body.description,
      });
      if (raw === null) throw new HttpError(404, NOT_ACTIVE);
      const receipt = receiptAnswer(raw);
      // The SQL audit row has the typed name; this one adds where the post came from.
      await audit(service, {
        action: 'delivery_link.post',
        actorKind: 'public_link',
        entityType: 'delivery',
        entityId: receipt.id,
        projectId: body.project_id,
        details: { number: receipt.number, name: receipt.posted_name },
        req,
      });
      return created(req, receipt);
    }
    case 'receipt': {
      const raw = await rpc<unknown>(service, 'link_delivery_receipt', { ...link, p_delivery_id: body.delivery_id });
      if (raw === null) throw new HttpError(404, 'That receipt is not available.');
      return ok(req, receiptAnswer(raw));
    }
  }
}));
