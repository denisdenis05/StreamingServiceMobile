import {
  artistMenuDestination,
  ArtistRoutes,
} from '../src/pages/Artist/ArtistNavigation';
import { menuOptions } from '../src/constants/navigation';
jest.mock('../src/services/SpotifyJamMenuAction', () => ({
  spotifyJamMenuAction: { label: 'Jam' },
}));
const Fixture = Object.freeze({
  artist: 'artist-fixture',
  recording: 'recording-fixture',
  album: 'album-fixture',
  first: 0,
  next: 1,
  artistAction: 'Go to artist',
  albumAction: 'Go to album',
});

test('Go to artist is adjacent to Go to album and opens the artist route using the selected song', () => {
  const position = menuOptions.findIndex(
    action => action.label === Fixture.artistAction,
  );
  expect(menuOptions[position + Fixture.next].label).toBe(Fixture.albumAction);
  const navigation = { navigate: jest.fn() };
  const parameters = {
    recordingIds: [Fixture.recording],
    albumId: Fixture.album,
  };
  menuOptions[position].onClick(navigation, parameters);
  expect(navigation.navigate).toHaveBeenCalledWith(
    ArtistRoutes.screen,
    artistMenuDestination(parameters),
  );
});
test('an empty player menu cannot open an unresolvable artist page', () => {
  const navigation = { navigate: jest.fn() };
  menuOptions
    .find(action => action.label === Fixture.artistAction)!
    .onClick(navigation);
  expect(navigation.navigate).not.toHaveBeenCalled();
});
