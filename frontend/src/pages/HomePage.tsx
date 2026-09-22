import { Button } from './ui/button'

export function HomePage() {
  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-bold mb-4">DRCIP Disaster Response and Coordination Platform</h1>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
        A platform for coordinating disaster response, sharing resources, and accessing operational intelligence.
      </p>
      <Button size="default" className="text-lg">Get Started</Button>
    </div>
  )
}