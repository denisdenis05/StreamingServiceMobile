import React from 'react';
import DefaultButton from '../../components/DefaultButton';
import PageContainer from '../../components/PageContainer';
import {
  ContentContainer,
  HeaderContainer,
  HeaderTitle,
  StyledImage,
} from './Home.style.tsx';
import {
  PLACEHOLDER_PROFILE_PIC,
  PLACEHOLDER_USERNAME,
} from '../../constants/placeholders.tsx';
import { HOME_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';

const Home = ({ navigation, route }: { navigation: any; route: any }) => {
  return (
    <PageContainer>
      <ContentContainer>
        <HeaderContainer>
          <StyledImage source={{ uri: PLACEHOLDER_PROFILE_PIC }} />
          <HeaderTitle>
            {HOME_HEADER_TEXT}
            {PLACEHOLDER_USERNAME}
          </HeaderTitle>
        </HeaderContainer>
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
        <DefaultButton
          title="Go to Details"
          onPress={() => navigation.navigate('Details')}
        />
      </ContentContainer>
      <Navbar navigation={navigation} route={route} />
    </PageContainer>
  );
};

export default Home;
