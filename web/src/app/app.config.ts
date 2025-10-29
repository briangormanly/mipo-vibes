import { provideZoneChangeDetection } from '@angular/core';

export const APP_CONFIG = [provideZoneChangeDetection({ eventCoalescing: true })];

