import React from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import './App.global.css';
import Spider from './Spider';

export default function App() {
  return (
    <Router>
      <Switch>
        <Route path="/" component={Spider} />
      </Switch>
    </Router>
  );
}
