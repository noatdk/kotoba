import React from 'react';
import Loader from 'react-loader-spinner';
import { useRouteMatch, Switch, Route } from 'react-router-dom';
import { DashboardHeader } from './header';
import Main from './main';
import CustomDeck from './custom_deck';
import GameReport from './reports';
import useLogin, { LoginState } from '../util/use_login';

function BodyGrid({ children }) {
  return (
    <div className="container">
      <div className="row">
        <div className="col-12 d-flex justify-content-center mt-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user, loginState, loginError } = useLogin();
  const match = useRouteMatch();

  if (loginState === LoginState.checking) {
    return (
      <BodyGrid>
        <Loader type="ThreeDots" color="#336699" />
      </BodyGrid>
    );
  }

  if (loginState === LoginState.error) {
    return (
      <BodyGrid>
        <div className="alert alert-danger mt-3" role="alert">
          <strong>RIP</strong>
          {' '}
          There was a problem logging in. Details:&nbsp;
          <strong>{loginError}</strong>
        </div>
      </BodyGrid>
    );
  }

  return (
    <>
      <DashboardHeader user={user} />
      <Switch>
        <Route path={`${match.path}/decks/:id`} render={(props) => user && <CustomDeck {...props} user={user} />} />
        <Route path={`${match.path}/game_reports/:id`} render={(props) => <GameReport {...props} user={user} />} />
        <Route path={match.path} render={(props) => user && <Main {...props} user={user} />} />
      </Switch>
    </>
  );
}
