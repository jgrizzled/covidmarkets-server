// API Express server

import express from 'express';
import moment from 'moment-timezone';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import ajs from '@awaitjs/express';
const { addAsync } = ajs;
import { calcTotalReturns } from 'portfolio-tools';

import db from './db/index.js';
import { NODE_ENV } from './config.js';

const api = addAsync(express());

if (NODE_ENV !== 'production') api.use(morgan('tiny'));

api.use(helmet());

api.use(cors());

/*
  main API route
  returns a timeseries within provided date range
  data: sp500tr or covid
  start: YYYYMMDD
  end: YYYYMMDD
*/
api.getAsync('/timeseries/:data/:start/:end', async (req, res) => {
  let { start, end, data } = req.params;

  let tz, t, getTimeseries;
  switch (data) {
    case 'sp500tr':
      tz = 'America/New_York';
      t = '17:00:00';
      getTimeseries = (start, end) =>
        calcTimeseriesTotalReturn(db.SP500R.getDateRange, start, end);
      break;
    case 'covid':
      tz = 'UTC';
      t = '23:59:59';
      getTimeseries = db.COVIDdata.getDateRange;
      break;
    default:
      return res.status('400').json({ error: 'Invalid data' });
  }

  const formatDate = date => {
    if (typeof date !== 'string' || date.length !== 8) return null;
    const filteredDate = date.replace(/\D/g, ''); // remove non-digit characters
    let momentDate;
    if (filteredDate.length === 8) {
      const y = date.substr(0, 4);
      const m = date.substr(4, 2);
      const d = date.substr(6, 2);
      const dateStr = `${y}-${m}-${d} ${t}`;
      momentDate = moment.tz(dateStr, tz);
    }
    if (!momentDate || !momentDate.isValid()) return null;
    return momentDate;
  };

  let startDate = formatDate(start);
  if (!startDate) return res.status('400').json({ error: 'Invalid start' });
  let endDate = formatDate(end);
  if (!endDate || startDate.isAfter(endDate))
    return res.status('400').json({ error: 'Invalid end' });

  const rows = await getTimeseries(startDate.toDate(), endDate.toDate());

  return res.status(200).json({ data: rows });
});

// global error handler
api.use(function errorHandler(error, req, res, next) {
  console.error(error);
  let response;
  if (NODE_ENV === 'production') response = { error: 'server error' };
  else response = { message: error.message, error };
  res.status(500).json(response);
});

api.get('/', (req, res) => {
  return res.status(400).json({ error: 'Invalid endpoint' });
});

// convert returns timeseries into total returns timeseries
const calcTimeseriesTotalReturn = async (getDateRange, start, end) => {
  const returns = await getDateRange(start, end);
  const cumulativeReturns = calcTotalReturns(returns.map(r => r.return));
  return returns.map(({ date }, i) => ({
    date,
    totalReturn: cumulativeReturns[i] - 1
  }));
};

export default api;
