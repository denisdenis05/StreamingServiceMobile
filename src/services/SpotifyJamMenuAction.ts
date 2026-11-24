import MusicNoteIcon from '../../assets/icons/musicNoteIcon';
import type { ActionItem } from '../constants/navigation';
import { SpotifyJamRoute } from '../pages/SpotifyJam/SpotifyJam.copy';
import { authenticationSession } from './AuthenticationService';
import { spotifySongSelection } from './spotify/SpotifySongSelection';

const QueueMenuLabel = 'Add to Spotify Jam';
export const spotifyJamMenuAction: ActionItem = {
  label: QueueMenuLabel, icon: MusicNoteIcon,
  onClick(navigation, parameters) {
    const selection = spotifySongSelection(parameters?.songs, authenticationSession.getSnapshot().accountIdentifier);
    navigation.navigate(SpotifyJamRoute, selection);
  },
};
