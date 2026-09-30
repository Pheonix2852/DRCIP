import { unwrap } from './utils'
import api from './api';


export const capacity = {
  get: () => api.get('/api/v1/capacity').then(res => unwrap<{ available_resources: number, active_teams: number, available_shelter_capacity: number }>(res))
}
