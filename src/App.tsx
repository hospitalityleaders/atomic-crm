import { CRM } from './root/CRM';

const App = () => (
  <CRM
    title=" "
    logo="./img/logo.svg" // Ensure this file exists in /public/img/
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