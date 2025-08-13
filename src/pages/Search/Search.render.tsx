import PageContainer from '../../components/PageContainer';
import {
  ContentContainer,
  HeaderContainer,
  HeaderTitle,
  SearchInput,
  SearchResultContainer,
  StyledImage,
} from './Search.style.tsx';
import { PLACEHOLDER_PROFILE_PIC } from '../../constants/placeholders.tsx';
import { SEARCH_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Album } from '../../constants/types.tsx';
import SearchEntry from '../../components/SearchEntry';
import { API_URL } from '@env';

const Search = ({ navigation, route }: { navigation: any; route: any }) => {
  const [query, setQuery] = useState('');
  const [albums, setAlbums] = useState<Album[]>([]);

  useEffect(() => {
    if (query.length <= 3) {
      setAlbums([]);
      return;
    }

    const delayDebounce = setTimeout(() => {
      const fetchData = async () => {
        try {
          const response = await axios.get(
            `${API_URL}/Metadata/search-albums`,
            { params: { query } }
          );
          setAlbums(response.data);
        } catch (error) {
          console.error('Error fetching search results:', error);
        } finally {
        }
      };

      fetchData();
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleSearchEntryClick = (
    albumId: any,
    albumTitle: any,
    albumArtist: any,
    albumCover: any
  ) => {
    navigation.navigate('AlbumViewer', {
      albumId,
      albumTitle,
      albumArtist,
      albumCover,
    });
  };

  return (
    <PageContainer>
      <ContentContainer>
        <HeaderContainer>
          <StyledImage source={{ uri: PLACEHOLDER_PROFILE_PIC }} />
          <HeaderTitle>{SEARCH_HEADER_TEXT}</HeaderTitle>
        </HeaderContainer>

        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
        />

        <SearchResultContainer>
          {albums.map((album: Album) => (
            <SearchEntry
              key={album.id.toString()}
              songTitle={album.title}
              songAuthor={album.artistName}
              albumCover={album.cover}
              onPressAction={() => {
                handleSearchEntryClick(
                  album.id,
                  album.title,
                  album.artistName,
                  album.cover
                );
              }}
            />
          ))}
        </SearchResultContainer>
      </ContentContainer>
      <Navbar navigation={navigation} route={route} />
    </PageContainer>
  );
};

export default Search;
