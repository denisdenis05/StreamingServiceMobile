import HomeIcon from '../../../assets/icons/homeIcon.tsx';
import SearchIcon from '../../../assets/icons/searchIcon.tsx';
import LibraryIcon from '../../../assets/icons/libraryIcon.tsx';
import CreateIcon from '../../../assets/icons/createIcon.tsx';
import { GradientContainer, MainContainer } from './Navbar.style.tsx';

const Navbar = () => {
  return (
    <GradientContainer>
      <MainContainer>
        <HomeIcon height={40} />
        <SearchIcon height={40} />
        <LibraryIcon height={40} />
        <CreateIcon height={40} />
      </MainContainer>
    </GradientContainer>
  );
};

export default Navbar;
