const formattedDate = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/London',
});

export function requestTime(value: string) {
  return formattedDate.format(new Date(value));
}
