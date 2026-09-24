import Instense from "./Axios-config";

export interface PersistableEntityComment {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
  mentionedUserIds?: number[];
}

export interface SaveEntityCommentsRequest {
  tenantId?: number;
  entityType: string;
  entityId: number;
  entityLabel?: string;
  linkPath?: string;
  comments: PersistableEntityComment[];
}

export class EntityCommentService {
  public static async Save(request: SaveEntityCommentsRequest): Promise<void> {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantId = request.tenantId || storage?.tenantID || 0;
    await Instense.put("/EntityComments", {
      tenantId,
      entityType: request.entityType,
      entityId: request.entityId,
      entityLabel: request.entityLabel,
      linkPath: request.linkPath,
      comments: (request.comments || []).map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt,
        createdBy: c.createdBy,
        mentionedUserIds: c.mentionedUserIds,
      })),
    });
  }
}
