import {
  CoverDirection,
  CoverGestureController,
  CoverGesturePolicy,
  CoverPhase,
} from '../src/pages/Playing/CoverGestureController';
import { CoverFixture, coverTracks } from './cover-gesture-fixtures';

function environment(index: number = CoverFixture.secondIndex) {
  let offsetPixels: number = CoverFixture.initialOffsetPixels;
  const navigate = jest.fn(
    async (_direction: CoverDirection): Promise<string | null> =>
      coverTracks[index].entryIdentifier,
  );
  const select = jest.fn(async (_entryIdentifier: string) => undefined);
  const cancelTimeout = jest.fn();
  let timeout: (() => void) | undefined;
  const controller = new CoverGestureController(
    coverTracks[index],
    coverTracks,
    {
      setOffset: value => {
        offsetPixels = value;
      },
      stopOffset: onStopped => onStopped(offsetPixels),
      navigate,
      select,
      scheduleTimeout: (operation, delayMilliseconds) => {
        expect(delayMilliseconds).toBe(
          CoverGesturePolicy.selectionTimeoutMilliseconds,
        );
        timeout = operation;
        return cancelTimeout;
      },
    },
  );
  controller.measure(CoverFixture.phoneWidthPixels);
  return {
    controller,
    navigate,
    select,
    cancelTimeout,
    timeout: () => timeout?.(),
    get offsetPixels() {
      return offsetPixels;
    },
    finish() {
      const motion = controller.getSnapshot().motion;
      if (motion === null) throw new Error(CoverFixture.failure);
      offsetPixels = motion.endOffsetPixels;
      controller.completeMotion(motion.identifier);
    },
    frame() {
      const motion = controller.getSnapshot().motion;
      if (motion === null) throw new Error(CoverFixture.failure);
      offsetPixels =
        motion.startOffsetPixels +
        (motion.endOffsetPixels - motion.startOffsetPixels) *
          CoverFixture.halfProgress;
    },
  };
}

test('Next, Previous and the next Next retain the correct outgoing cover and direction across completed commands', async () => {
  const scenario = environment(CoverFixture.firstIndex);
  for (const [direction, targetIndex, expectedOffset] of [
    [
      CoverDirection.Next,
      CoverFixture.secondIndex,
      -CoverFixture.fullPhoneStepPixels,
    ],
    [
      CoverDirection.Previous,
      CoverFixture.firstIndex,
      CoverFixture.fullPhoneStepPixels,
    ],
    [
      CoverDirection.Next,
      CoverFixture.secondIndex,
      -CoverFixture.fullPhoneStepPixels,
    ],
  ] as const) {
    const origin = scenario.controller.getSnapshot().center;
    expect(scenario.controller.navigate(direction)).toBe(true);
    await Promise.resolve();
    scenario.controller.update(coverTracks[targetIndex], coverTracks, false);
    expect(scenario.controller.getSnapshot().center).toBe(origin);
    expect(scenario.controller.getSnapshot().motion?.endOffsetPixels).toBe(
      expectedOffset,
    );
    scenario.finish();
    expect(scenario.controller.getSnapshot().center).toBe(
      coverTracks[targetIndex],
    );
    expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Idle);
  }
});

test('Rapid duplicate button commands are blocked until the current transition finishes', () => {
  const scenario = environment();
  expect(scenario.controller.navigate(CoverDirection.Next)).toBe(true);
  expect(scenario.controller.navigate(CoverDirection.Previous)).toBe(false);
  expect(scenario.navigate).toHaveBeenCalledTimes(CoverFixture.singleCall);
  scenario.controller.dispose();
});

test('Dragging previews both neighbors, follows the finger in either direction and never selects before release', () => {
  const scenario = environment();
  expect(scenario.controller.beginDrag()).toBe(true);
  for (const offsetPixels of [
    -CoverFixture.fullPhoneStepPixels,
    -CoverFixture.shortDragPixels,
    CoverFixture.shortDragPixels,
    CoverFixture.fullPhoneStepPixels,
  ]) {
    scenario.controller.drag(offsetPixels);
    expect(scenario.offsetPixels).toBe(offsetPixels);
    expect(scenario.controller.getSnapshot().previous).toBe(
      coverTracks[CoverFixture.firstIndex],
    );
    expect(scenario.controller.getSnapshot().next).toBe(
      coverTracks[CoverFixture.thirdIndex],
    );
    expect(scenario.select).not.toHaveBeenCalled();
  }
});

for (const directionSign of [
  -CoverGesturePolicy.fullWidthFraction,
  CoverGesturePolicy.fullWidthFraction,
]) {
  test(`A released drag beyond thirty percent selects the ${
    directionSign < CoverFixture.initialOffsetPixels ? 'next' : 'previous'
  } queue occurrence and completes its remaining distance`, () => {
    const scenario = environment();
    scenario.controller.beginDrag();
    scenario.controller.drag(
      directionSign * CoverFixture.abovePhoneThresholdPixels,
    );
    scenario.controller.release(
      CoverFixture.stationaryVelocityPixelsPerMillisecond,
    );
    const targetIndex =
      directionSign < CoverFixture.initialOffsetPixels
        ? CoverFixture.thirdIndex
        : CoverFixture.firstIndex;
    expect(scenario.select).toHaveBeenCalledWith(
      coverTracks[targetIndex].entryIdentifier,
    );
    expect(scenario.controller.getSnapshot().motion).toMatchObject({
      startOffsetPixels: directionSign * CoverFixture.abovePhoneThresholdPixels,
      endOffsetPixels: directionSign * CoverFixture.fullPhoneStepPixels,
    });
    scenario.controller.update(coverTracks[targetIndex], coverTracks, false);
    expect(scenario.controller.getSnapshot().center).toBe(
      coverTracks[CoverFixture.secondIndex],
    );
    scenario.finish();
    expect(scenario.controller.getSnapshot().center).toBe(
      coverTracks[targetIndex],
    );
    expect(scenario.cancelTimeout).toHaveBeenCalled();
  });
}

for (const dragPixels of [
  CoverFixture.belowPhoneThresholdPixels,
  CoverFixture.phoneThresholdPixels,
]) {
  test(`A slow ${dragPixels} pixel drag does not exceed the phone threshold and animates back from its actual position`, () => {
    const scenario = environment();
    scenario.controller.beginDrag();
    scenario.controller.drag(-dragPixels);
    scenario.controller.release(CoverFixture.slowVelocityPixelsPerMillisecond);
    expect(scenario.select).not.toHaveBeenCalled();
    expect(scenario.offsetPixels).toBe(-dragPixels);
    expect(scenario.controller.getSnapshot().motion).toMatchObject({
      startOffsetPixels: -dragPixels,
      endOffsetPixels: CoverFixture.initialOffsetPixels,
    });
    scenario.finish();
    expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Idle);
  });
}

for (const directionSign of [
  CoverGesturePolicy.nextSign,
  CoverGesturePolicy.previousSign,
]) {
  test(`A short fast ${directionSign} flick uses projected inertia to select a neighbor`, () => {
    const scenario = environment();
    scenario.controller.beginDrag();
    scenario.controller.drag(directionSign * CoverFixture.shortDragPixels);
    scenario.controller.release(
      directionSign * CoverFixture.fastVelocityPixelsPerMillisecond,
    );
    expect(scenario.select).toHaveBeenCalledTimes(CoverFixture.singleCall);
    expect(scenario.controller.getSnapshot().motion?.startOffsetPixels).toBe(
      directionSign * CoverFixture.shortDragPixels,
    );
  });
}

test('A short slow swipe returns smoothly without selecting a track', () => {
  const scenario = environment();
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.shortDragPixels);
  scenario.controller.release(-CoverFixture.slowVelocityPixelsPerMillisecond);
  expect(scenario.select).not.toHaveBeenCalled();
  expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Returning);
});

for (const [index, sign] of [
  [CoverFixture.firstIndex, CoverGesturePolicy.previousSign],
  [CoverFixture.thirdIndex, CoverGesturePolicy.nextSign],
] as const) {
  test(`Queue boundary ${index} clamps drag at thirty percent and blocks fast flick navigation`, () => {
    const scenario = environment(index);
    scenario.controller.beginDrag();
    scenario.controller.drag(sign * CoverFixture.oversizedDragPixels);
    expect(scenario.offsetPixels).toBe(
      sign * CoverFixture.phoneThresholdPixels,
    );
    scenario.controller.release(
      sign * CoverFixture.fastVelocityPixelsPerMillisecond,
    );
    expect(scenario.select).not.toHaveBeenCalled();
    expect(scenario.controller.getSnapshot().motion).toMatchObject({
      startOffsetPixels: sign * CoverFixture.phoneThresholdPixels,
      endOffsetPixels: CoverFixture.initialOffsetPixels,
    });
  });
}

test('The threshold uses current measured width, including a resize during the drag', () => {
  const scenario = environment();
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.abovePhoneThresholdPixels);
  scenario.controller.measure(CoverFixture.resizedWidthPixels);
  scenario.controller.release(
    CoverFixture.stationaryVelocityPixelsPerMillisecond,
  );
  expect(scenario.select).not.toHaveBeenCalled();
  scenario.finish();
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.aboveResizedThresholdPixels);
  scenario.controller.release(
    CoverFixture.stationaryVelocityPixelsPerMillisecond,
  );
  expect(scenario.select).toHaveBeenCalledTimes(CoverFixture.singleCall);
});

test('Removing the previewed queue neighbor while holding prevents navigation on release', () => {
  const scenario = environment();
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.abovePhoneThresholdPixels);
  scenario.controller.update(
    coverTracks[CoverFixture.secondIndex],
    coverTracks.slice(CoverFixture.firstIndex, CoverFixture.thirdIndex),
    false,
  );
  scenario.controller.release(-CoverFixture.fastVelocityPixelsPerMillisecond);
  expect(scenario.select).not.toHaveBeenCalled();
  expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Returning);
});

test('Gesture cancellation and disabled controls animate back instead of resetting the offset', () => {
  const scenario = environment();
  scenario.controller.beginDrag();
  scenario.controller.drag(CoverFixture.shortDragPixels);
  scenario.controller.update(
    coverTracks[CoverFixture.secondIndex],
    coverTracks,
    true,
  );
  expect(scenario.offsetPixels).toBe(CoverFixture.shortDragPixels);
  expect(scenario.controller.getSnapshot().motion?.startOffsetPixels).toBe(
    CoverFixture.shortDragPixels,
  );
  expect(scenario.select).not.toHaveBeenCalled();
  scenario.finish();
  expect(scenario.controller.beginDrag()).toBe(false);
});

test('A failed swipe command returns from the actual partially animated position', async () => {
  const scenario = environment();
  scenario.select.mockRejectedValueOnce(new Error(CoverFixture.failure));
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.abovePhoneThresholdPixels);
  scenario.controller.release(
    CoverFixture.stationaryVelocityPixelsPerMillisecond,
  );
  scenario.frame();
  const actualOffsetPixels = scenario.offsetPixels;
  await Promise.resolve();
  expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Returning);
  expect(scenario.controller.getSnapshot().motion?.startOffsetPixels).toBe(
    actualOffsetPixels,
  );
});

test('A missing selection acknowledgement times out and an old completion cannot finish the return animation', () => {
  const scenario = environment();
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.abovePhoneThresholdPixels);
  scenario.controller.release(
    CoverFixture.stationaryVelocityPixelsPerMillisecond,
  );
  const retiredMotion = scenario.controller.getSnapshot().motion;
  scenario.frame();
  scenario.timeout();
  scenario.controller.completeMotion(retiredMotion!.identifier);
  expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Returning);
  scenario.finish();
  expect(scenario.controller.getSnapshot().center).toBe(
    coverTracks[CoverFixture.secondIndex],
  );
});

test('Completing the animation before the native selection holds the preview until selection is observed', () => {
  const scenario = environment();
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.abovePhoneThresholdPixels);
  scenario.controller.release(
    CoverFixture.stationaryVelocityPixelsPerMillisecond,
  );
  scenario.finish();
  expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Changing);
  scenario.controller.update(
    coverTracks[CoverFixture.thirdIndex],
    coverTracks,
    false,
  );
  expect(scenario.controller.getSnapshot().center).toBe(
    coverTracks[CoverFixture.thirdIndex],
  );
  expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Idle);
});

test('Metadata refresh cannot reset a running transition, and disposal fences its late completion', () => {
  const scenario = environment();
  scenario.controller.update(
    coverTracks[CoverFixture.thirdIndex],
    coverTracks,
    false,
  );
  const motion = scenario.controller.getSnapshot().motion;
  scenario.controller.update(
    {
      ...coverTracks[CoverFixture.thirdIndex],
      title: CoverFixture.updatedTitle,
    },
    coverTracks,
    false,
  );
  expect(scenario.controller.getSnapshot().motion).toBe(motion);
  scenario.controller.dispose();
  scenario.controller.completeMotion(motion!.identifier);
  expect(scenario.controller.getSnapshot().phase).toBe(CoverPhase.Changing);
});

test('A delayed view projection preserves Next direction across an end-to-start queue wrap', async () => {
  const scenario = environment(CoverFixture.thirdIndex);
  scenario.navigate.mockResolvedValueOnce(CoverFixture.firstIdentifier);
  scenario.controller.navigate(CoverDirection.Next);
  await Promise.resolve();
  expect(scenario.controller.getSnapshot().busy).toBe(true);
  scenario.controller.update(
    coverTracks[CoverFixture.firstIndex],
    coverTracks,
    false,
  );
  expect(scenario.controller.getSnapshot().motion?.endOffsetPixels).toBe(
    -CoverFixture.fullPhoneStepPixels,
  );
});

test('A Previous command that only restarts the current song cannot reverse the following automatic advance', async () => {
  const scenario = environment(CoverFixture.firstIndex);
  scenario.controller.navigate(CoverDirection.Previous);
  await Promise.resolve();
  expect(scenario.controller.getSnapshot().busy).toBe(false);
  scenario.controller.update(
    coverTracks[CoverFixture.secondIndex],
    coverTracks,
    false,
  );
  expect(scenario.controller.getSnapshot().motion?.endOffsetPixels).toBe(
    -CoverFixture.fullPhoneStepPixels,
  );
});

test('An external track change during a held drag starts from the current horizontal position', () => {
  const scenario = environment();
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.shortDragPixels);
  scenario.controller.update(
    coverTracks[CoverFixture.thirdIndex],
    coverTracks,
    false,
  );
  expect(scenario.controller.getSnapshot().motion?.startOffsetPixels).toBe(
    -CoverFixture.shortDragPixels,
  );
});

test('Disposal cancels pending selection timeouts and late selection failures cannot start another motion', async () => {
  const scenario = environment();
  let rejectSelection: (failure: Error) => void = () => undefined;
  scenario.select.mockImplementationOnce(
    () =>
      new Promise((_resolveSelection, reject) => {
        rejectSelection = reject;
      }),
  );
  scenario.controller.beginDrag();
  scenario.controller.drag(-CoverFixture.abovePhoneThresholdPixels);
  scenario.controller.release(
    CoverFixture.stationaryVelocityPixelsPerMillisecond,
  );
  const retiredMotion = scenario.controller.getSnapshot().motion;
  scenario.controller.dispose();
  rejectSelection(new Error(CoverFixture.failure));
  await Promise.resolve();
  scenario.timeout();
  expect(scenario.cancelTimeout).toHaveBeenCalled();
  expect(scenario.controller.getSnapshot().motion).toBe(retiredMotion);
});
