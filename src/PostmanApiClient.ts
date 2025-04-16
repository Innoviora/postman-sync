import axios, { AxiosInstance, HttpStatusCode } from "axios";
import { PostmanCollection } from "./types";

export class PostmanApiClient {
  private axios: AxiosInstance;

  constructor(private apiKey: string) {
    this.axios = axios.create({
      baseURL: "https://api.getpostman.com",
      headers: {
        "X-API-Key": this.apiKey,
      },
    });
  }

  async fetchCollection(collectionId: string): Promise<PostmanCollection> {
    const response = await this.axios.get(`/collections/${collectionId}`);
    return response.data.collection;
  }

  async upsertCollection(
      workspaceId: string,
      collection: any,
      collectionUid?: string,
      preventAutoCreate:boolean = false
  ): Promise<{ action: "insert" | "update"; response: any }> {
    if (!collectionUid) {
      if (!preventAutoCreate) return await this.createCollection(workspaceId, collection);
      else throw new Error("Target workspace is missing 'collectionUid', and 'preventAutoCreate' is set to true. Unable to auto-create collection.");
    }

    try {
      return await this.updateCollection(workspaceId, collection, collectionUid);
    } catch (err: any) {
      if ([HttpStatusCode.Forbidden, HttpStatusCode.NotFound].includes(err.response?.status)) {
        return await this.createCollection(workspaceId, collection);
      }

      throw err;
    }
  }

  private async updateCollection(
      workspaceId: string,
      collection: any,
      uid: string
  ): Promise<{ action: "update"; response: any }> {
    const putRes = await this.axios.put(`/collections/${uid}`, { collection }, {
      params: { workspace: workspaceId },
    });

    return {
      action: "update",
      response: putRes
    };
  }

  private async createCollection(
      workspaceId: string,
      collection: any
  ): Promise<{ action: "insert"; response: any }> {
    const postRes = await this.axios.post(`/collections`, { collection }, {
      params: { workspace: workspaceId },
    });

    return {
      action: "insert",
      response: postRes
    };
  }
}
