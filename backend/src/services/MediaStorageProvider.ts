export interface MediaStorageProvider {
  upload(file: Express.Multer.File, metadata: { incidentId: string }): Promise<{
    providerAssetId: string;
    secureUrl: string;
  }>;
}

export interface MediaProviderConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}
