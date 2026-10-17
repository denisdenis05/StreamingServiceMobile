export interface PlaybackNativeSessionReceipt {
  readonly serverAddress: string;
  readonly accountIdentifier: string;
  readonly engineEpoch: string;
  readonly authenticationEpoch: string;
}
export interface PlaybackNativeSessionOwnership {
  read(): Promise<PlaybackNativeSessionReceipt | null>;
  write(receipt: PlaybackNativeSessionReceipt): Promise<void>;
  clear(): Promise<void>;
}
