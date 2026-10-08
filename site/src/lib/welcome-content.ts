import { parse } from 'yaml';
import source from '../data/welcome.yml?raw';
import contactSource from '../data/settings/contact.yml?raw';
import { welcomeSchema, welcomeContactSchema } from './welcome';

// Both routes are prerendered: publishing always requires a successful build.
export const welcomeContent = welcomeSchema.parse(parse(source));
export const welcomeContact = welcomeContactSchema.parse(parse(contactSource));
