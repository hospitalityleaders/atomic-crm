import { CRM } from './root/CRM';

const App = () => (
  <CRM
    title=" "
    logo="./img/logo.svg" // The logo path is relative to the public directory
    lightTheme={{
      palette: {
        primary: { main: '#384677' },
        background: { default: '#f6f8fa' },
        text: { primary: '#7c8990', secondary: '#272e41' },
      },
    }}
    noteStatuses={[
      { value: 'cold', label: 'Cold', color: '#32a3fd' },
      { value: 'warm', label: 'Warm', color: '#7dc81b' },
      { value: 'hot', label: 'Hot', color: '#fd3732' },
    ]}
    dealStages={[
      { value: 'opportunity', label: 'New Lead' },
      { value: 'interested', label: 'Interested' },
      { value: 'demo-scheduled', label: 'Demo Scheduled' },
      { value: 'enrollment', label: 'Enrollment' },
      { value: 'offer', label: 'Offer' },
      { value: 'won', label: 'Accepted' },
      { value: 'lost', label: 'Declined' },
      { value: 'not-interested', label: 'Not Interested' },
    ]}
    companySectors={[
      'Individual Hotel',
      'Small Hotel Group',
      'Global Hotel Group',
      'Cluster',
      'Brand',
      'Restaurants',
      'Fast Food',
      'Cruise',
      'Spa',
      'Health',
      'Finance',
      'IT',
      'Services',
    ]}
    dealCategories={[
      'Anchor',
      'Enterprise',
      'Business',
      'Economy',
      'Special',
    ]}
    taskTypes={[
      'Phone Call',
      'Email',
      'Meeting',
      'Video Call',
      'Demo',
    ]}
  />
);

export default App;