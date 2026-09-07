const { expect } = require('chai');
const emails = require('../../../core/common/email');

const {
  buildInstanceBackOnlineScope,
  buildInstanceOfflineScope,
  formatDateTime,
  formatDuration,
  minutesBetween,
} = require('../../../core/common/instance-email-scope');

describe('instance-email-scope', () => {
  it('should format durations with the two most significant units', () => {
    expect(formatDuration(0, 'fr')).to.equal('0 min');
    expect(formatDuration(45, 'fr')).to.equal('45 min');
    expect(formatDuration(60, 'fr')).to.equal('1 h');
    expect(formatDuration(135, 'fr')).to.equal('2 h 15 min');
    expect(formatDuration(135, 'en')).to.equal('2 h 15 min');
    expect(formatDuration(24 * 60, 'fr')).to.equal('1 jour');
    expect(formatDuration(24 * 60, 'en')).to.equal('1 day');
    expect(formatDuration(3 * 24 * 60 + 4 * 60 + 7, 'fr')).to.equal('3 jours 4 h');
    expect(formatDuration(3 * 24 * 60 + 4 * 60 + 7, 'en')).to.equal('3 days 4 h');
    // a fraction of minute is not a minute, a negative duration is no duration
    expect(formatDuration(59.9, 'en')).to.equal('59 min');
    expect(formatDuration(-10, 'en')).to.equal('0 min');
  });

  it('should format dates and times in UTC, saying so', () => {
    const date = new Date('2026-09-07T14:05:00Z');
    expect(formatDateTime(date, 'fr')).to.equal('7 septembre 2026 à 14:05 UTC');
    expect(formatDateTime(date, 'en')).to.equal('7 September 2026 at 14:05 UTC');
    expect(formatDateTime(null, 'en')).to.equal('');
  });

  it('should count whole minutes between two dates', () => {
    expect(minutesBetween('2026-09-07T12:00:00Z', '2026-09-07T13:30:59Z')).to.equal(90);
  });

  it('should build the instance offline scope', () => {
    const scope = buildInstanceOfflineScope({
      instance: { name: 'Raspberry Pi' },
      user: { name: 'Tony Stark', instance_offline_alert_delay_in_minutes: 60 },
      lastSeenAt: new Date('2026-09-07T12:00:00Z'),
      now: new Date('2026-09-07T14:15:00Z'),
      language: 'fr',
    });
    expect(scope).to.deep.equal({
      firstname: 'Tony',
      instanceName: 'Raspberry Pi',
      offlineFor: '2 h 15 min',
      lastSeenDate: '7 septembre 2026 à 12:00 UTC',
      alertDelay: '1 h',
    });
  });

  it('should build the instance back online scope', () => {
    const scope = buildInstanceBackOnlineScope({
      instance: { name: 'Raspberry Pi' },
      user: { name: null },
      lastSeenAt: new Date('2026-09-06T12:00:00Z'),
      now: new Date('2026-09-07T14:15:00Z'),
      language: 'en',
    });
    expect(scope).to.deep.equal({
      firstname: '',
      instanceName: 'Raspberry Pi',
      downtime: '1 day 2 h',
      lastSeenDate: '6 September 2026 at 12:00 UTC',
    });
  });

  it('should render the instance offline and back online emails in both languages', () => {
    ['fr', 'en'].forEach((language) => {
      const offlineHtml = emails.instance_offline[language].ejs(
        buildInstanceOfflineScope({
          instance: { name: 'Raspberry Pi' },
          user: { name: 'Tony', instance_offline_alert_delay_in_minutes: 60 },
          lastSeenAt: new Date('2026-09-07T12:00:00Z'),
          now: new Date('2026-09-07T14:15:00Z'),
          language,
        }),
      );
      expect(offlineHtml).to.include('Raspberry Pi');
      expect(offlineHtml).to.include('2 h 15 min');
      expect(offlineHtml).to.include('1 h');
      const backOnlineHtml = emails.instance_back_online[language].ejs(
        buildInstanceBackOnlineScope({
          instance: { name: 'Raspberry Pi' },
          user: { name: 'Tony' },
          lastSeenAt: new Date('2026-09-07T12:00:00Z'),
          now: new Date('2026-09-07T14:15:00Z'),
          language,
        }),
      );
      expect(backOnlineHtml).to.include('Raspberry Pi');
      expect(backOnlineHtml).to.include('2 h 15 min');
    });
  });
});
