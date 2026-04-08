import { useEffect, useState } from 'react';

const LoginState = {
  checking: 1,
  notLoggedIn: 2,
  loggedIn: 4,
  error: 8,
};

function useLogin() {
  const [user, setUser] = useState(undefined);
  const [loginState, setLoginState] = useState(LoginState.checking);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    async function checkLogin() {
      try {
        const res = await fetch('/api/users/me');

        if (res.ok) {
          setUser(await res.json());
          setLoginState(LoginState.loggedIn);
        } else if (res.status === 401) {
          setLoginState(LoginState.notLoggedIn);
        } else {
          setLoginState(LoginState.error);
          setLoginError(`Error logging in. Error code: ${res.status}. Please try refreshing and if the issue persists please report it.`);
        }
      } catch (err) {
        setLoginState(LoginState.error);
        setLoginError(`Error logging in. Error detail: ${err.message}.`);
      }
    }

    checkLogin();
  }, []);

  return { user, loginState, loginError };
}

export { LoginState };
export default useLogin;
