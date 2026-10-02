// Comments on an item (migrations 0050, 0054): what comment_list returns, parsed at the boundary. The database decides
// who reads (whoever may write comments and read the item: can_read) and who writes (can_write); the UI only shows it.
import { z } from 'zod';
import type { CommentEntity } from '../lib/entityTarget';

const commentSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
  /** Set once the text has changed; the earlier texts are in `earlier`, oldest first. */
  edited_at: z.string().nullable(),
  author_id: z.string(),
  author_name: z.string(),
  author_company: z.string(),
  mine: z.boolean(),
  earlier: z.array(z.object({ body: z.string(), written_at: z.string() })),
});
export type CommentRow = z.infer<typeof commentSchema>;

/** comment_list(p_project_id, p_entity_type, p_entity_id): oldest first. can_read false (a bidder, a viewer): no
 *  comments section at all. */
export const commentListSchema = z.object({
  can_read: z.boolean(),
  can_write: z.boolean(),
  comments: z.array(commentSchema),
});
export type CommentList = z.infer<typeof commentListSchema>;

/** The item the comments are on. */
export interface CommentTarget {
  projectId: string;
  entityType: CommentEntity;
  entityId: string;
}

/** Comments are at most this long (the table's check). */
export const COMMENT_MAX = 4000;
