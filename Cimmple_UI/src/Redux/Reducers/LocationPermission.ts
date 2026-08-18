const initialState = {
  locationId: Number(localStorage.getItem('locationId')) || 0,
};

const LocationReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'SET_LOCATION': {
      const nextId = Number(action.payload) || 0;
      if (nextId > 0) {
        localStorage.setItem('locationId', String(nextId));
      } else {
        localStorage.removeItem('locationId');
      }
      return { ...state, locationId: nextId };
    }
    case 'SET_LOCATION_ID':
      return {
        ...state,
        locationId: Number(action.payload) || 0
      };
    default:
      return state;
  }
};

export default LocationReducer;
