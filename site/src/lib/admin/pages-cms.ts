export const PAGES_CMS_REPOSITORY_URL =
  'https://app.pagescms.org/olrigbank/soccotash';
export const PAGES_CMS_BRANCH = 'main';

const branchUrl = `${PAGES_CMS_REPOSITORY_URL}/${encodeURIComponent(PAGES_CMS_BRANCH)}`;

export type PagesCmsSection = {
  title: string;
  description: string;
  buttonLabel: string;
  href: string;
};

export const PAGES_CMS_SECTIONS: PagesCmsSection[] = [
  {
    title: 'General pages',
    description:
      'Edit the home page, contact page, guest information and other general website pages.',
    buttonLabel: 'Open General pages',
    href: `${branchUrl}/collection/pages`,
  },
  {
    title: 'Listings',
    description:
      'Edit the Main House, Cottage and whole-property or large-group listing content.',
    buttonLabel: 'Open Listings',
    href: `${branchUrl}/collection/listings`,
  },
  {
    title: 'Spaces',
    description:
      'Edit bedrooms, bathrooms, kitchens, lounges, gardens and other individual spaces.',
    buttonLabel: 'Open Spaces',
    href: `${branchUrl}/collection/spaces`,
  },
  {
    title: 'Local guide',
    description:
      'Edit attractions, restaurants, activities, events and local recommendations.',
    buttonLabel: 'Open Local guide',
    href: `${branchUrl}/collection/local-guide`,
  },
  {
    title: 'Site settings',
    description:
      'Edit the site title, description, public URL and default logo or image.',
    buttonLabel: 'Open Site settings',
    href: `${branchUrl}/file/site-settings`,
  },
  {
    title: 'Contact details',
    description:
      'Edit the public contact name, email address, telephone, WhatsApp number and address.',
    buttonLabel: 'Open Contact details',
    href: `${branchUrl}/file/contact-settings`,
  },
  {
    title: 'Navigation',
    description:
      'Edit the structure and order of the public website navigation.',
    buttonLabel: 'Open Navigation',
    href: `${branchUrl}/file/navigation`,
  },
  {
    title: 'Images',
    description:
      'Upload, browse and manage images used throughout the public website.',
    buttonLabel: 'Open Images',
    href: `${branchUrl}/media/images`,
  },
];
