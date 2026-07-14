const initialState = {
  locationId: Number(localStorage.getItem('locationId')) || 0,
};

const LocationReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'SET_LOCATION':
      localStorage.setItem('locationId', action.payload.toString());
      return { ...state, locationId: action.payload };
    case 'SET_LOCATION_ID':
      return {
        ...state,
        locationId: action.payload
      };
    default:
      return state;
  }
};

export default LocationReducer;
