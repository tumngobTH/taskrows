import { invoke } from "@tauri-apps/api/core";

export const getOauthClient = (): Promise<string | null> => invoke("get_oauth_client");

export const setOauthClient = (clientId: string, clientSecret: string): Promise<void> =>
  invoke("set_oauth_client", { clientId, clientSecret });

export const startSignIn = (): Promise<{ id: string; email: string }> => invoke("start_sign_in");

export const getAccessToken = (accountId: string): Promise<string> =>
  invoke("get_access_token", { accountId });

export const removeAccount = (accountId: string): Promise<void> =>
  invoke("remove_account", { accountId });

export const readJson = (name: string): Promise<string | null> => invoke("read_json", { name });

export const writeJson = (name: string, content: string): Promise<void> =>
  invoke("write_json", { name, content });

export const deleteJson = (name: string): Promise<void> => invoke("delete_json", { name });
