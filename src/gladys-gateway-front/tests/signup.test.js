import Signup from '../src/routes/signup';

// See: https://github.com/mzgoddard/preact-render-spy
import { shallow } from 'preact-render-spy';

describe('Initial Test of the Signup', () => {
  test('Signup has a signup form', () => {
    const context = shallow(<Signup />);
    expect(context.find('h2').text()).toBe('Gladys Gateway');
  });
});
