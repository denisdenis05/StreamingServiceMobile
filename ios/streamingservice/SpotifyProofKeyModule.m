#import <React/RCTBridgeModule.h>
#import "streamingservice-Swift.h"

static NSString *const SpotifyProofFailureCode = @"proof-key-unavailable";
static NSString *const SpotifyProofFailureMessage = @"Secure Spotify login is unavailable.";

@interface SpotifyProofKey : NSObject <RCTBridgeModule>
@end

@implementation SpotifyProofKey

RCT_EXPORT_MODULE(SpotifyProofKey)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(generate:(RCTPromiseResolveBlock)promiseResolve rejecter:(RCTPromiseRejectBlock)promiseReject)
{
  SpotifyProofKeyBridge *bridge = [SpotifyProofKeyBridge new];
  NSError *failure = nil;
  NSDictionary<NSString *, NSString *> *proof = [bridge generateProofAndReturnError:&failure];
  if (proof == nil) {
    promiseReject(SpotifyProofFailureCode, SpotifyProofFailureMessage, nil);
    return;
  }
  promiseResolve(proof);
}

@end
