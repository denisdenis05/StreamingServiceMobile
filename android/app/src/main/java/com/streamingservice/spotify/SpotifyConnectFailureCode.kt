package com.streamingservice.spotify

enum class SpotifyConnectFailureCode(val wireValue: String) {
    Network("network"), InvalidInput("invalid-input"), Canceled("canceled"), InvalidResponse("invalid-response"),
    Deadline("deadline"), Unauthorized("unauthorized"), Forbidden("forbidden"), NotFound("not-found"),
    RateLimited("rate-limited"), Backpressure("backpressure"), Unsupported("unsupported"), UnknownOutcome("unknown-outcome"), Superseded("superseded")
}
